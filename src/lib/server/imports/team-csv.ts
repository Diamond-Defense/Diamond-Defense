import type { SqlCommand, SqliteDatabaseAdapter } from '$lib/server/database/adapter';
import { createPasswordHash } from '$lib/server/security/passwords';
import { SqliteTeamRepository, type TeamOption } from '$lib/server/repositories/teams';

type ImportAction = 'create' | 'update' | 'restore' | 'archive' | 'unchanged';
type ImportKind = 'team' | 'member';

export interface TeamCsvIssue {
  row: number;
  severity: 'error' | 'warning';
  message: string;
}

interface CsvRecord {
  row: number;
  values: Record<string, string>;
}

interface TeamOperation {
  row: number;
  kind: 'team';
  action: ImportAction;
  label: string;
  teamId: string;
  name: string;
  seasonName: string;
  before?: TeamOption;
}

interface MemberOperation {
  row: number;
  kind: 'member';
  action: ImportAction;
  label: string;
  teamId: string;
  userId: string;
  role: 'player' | 'coach';
  name: string;
  number: string;
  password: string;
  before?: TeamOption['roster'][number];
}

type ImportOperation = TeamOperation | MemberOperation;

export interface TeamCsvPreview {
  valid: boolean;
  fingerprint: string;
  format: 'modern' | 'legacy';
  summary: {
    rows: number;
    changes: number;
    teams: number;
    members: number;
    creates: number;
    updates: number;
    restores: number;
    archives: number;
    unchanged: number;
    errors: number;
    warnings: number;
  };
  issues: TeamCsvIssue[];
  operations: Array<{
    row: number;
    kind: ImportKind;
    action: ImportAction;
    label: string;
    teamId: string;
    userId?: string;
  }>;
}

interface ImportPlan {
  preview: TeamCsvPreview;
  operations: ImportOperation[];
}

const REQUIRED_HEADERS = ['record_type', 'action', 'team_id'];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const MAX_RECORDS = 100;

export class TeamCsvValidationError extends Error {}
export class TeamCsvStalePreviewError extends Error {}

export function teamCsvTemplate(): string {
  return [
    'record_type,action,team_id,team_name,season_name,user_id,role,name,number,password',
    'team,upsert,13u-black,13U Black,Spring 2027,,,,,',
    'member,upsert,13u-black,,,13u-black-jordan-12,player,Jordan Lee,12,Temp-4821',
    'member,upsert,13u-black,,,13u-black-coach-rivera,coach,Coach Rivera,,change-me',
  ].join('\r\n');
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function parseDelimited(text: string): { headers: string[]; records: CsvRecord[]; issue?: string } {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length
    ? '\t' : ',';
  const rows: Array<{ row: number; cells: string[] }> = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let row = 1;
  let rowStarted = 1;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
        if (character === '\n') row += 1;
      }
      continue;
    }
    if (character === '"' && !cell) quoted = true;
    else if (character === delimiter) {
      cells.push(cell.trim());
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      cells.push(cell.trim());
      if (cells.some(Boolean)) rows.push({ row: rowStarted, cells });
      cells = [];
      cell = '';
      row += 1;
      rowStarted = row;
    } else cell += character;
  }
  if (quoted) return { headers: [], records: [], issue: `Row ${rowStarted} contains an unclosed quote.` };
  cells.push(cell.trim());
  if (cells.some(Boolean)) rows.push({ row: rowStarted, cells });
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].cells.map(normalizeHeader);
  const records = rows.slice(1).map(({ row: sourceRow, cells: values }) => ({
    row: sourceRow,
    values: Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])),
  }));
  return { headers, records };
}

function truthy(value: string): boolean {
  return ['1', 'y', 'yes', 'true', 'remove', 'delete'].includes(value.trim().toLowerCase());
}

function parseLegacyLine(line: string): string[] {
  const delimiter = (line.match(/\t/g) || []).length > (line.match(/,/g) || []).length ? '\t' : ',';
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === '"' && line[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === delimiter && !quoted) { cells.push(cell.trim()); cell = ''; }
    else cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function legacyRecords(csv: string, existingTeams: TeamOption[]): CsvRecord[] | null {
  if (!/\[\s*TEAMS\s*\]/i.test(csv) || !/\[\s*PLAYERS\s*\]/i.test(csv)) return null;
  const lines = csv.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  let section = '';
  let headers: string[] = [];
  const records: CsvRecord[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (/^\[TEAMS\]$/i.test(line)) { section = 'team'; headers = []; continue; }
    if (/^\[PLAYERS\]$/i.test(line)) { section = 'member'; headers = []; continue; }
    const cells = parseLegacyLine(line);
    if (!headers.length) { headers = cells.map(normalizeHeader); continue; }
    const values = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] || '']));
    const teamName = values.team_name || values.team || '';
    const existingTeam = existingTeams.find((team) => team.name.toLowerCase() === teamName.toLowerCase());
    const teamId = existingTeam?.id || slug(teamName);
    if (section === 'team') {
      records.push({ row: index + 1, values: {
        record_type: 'team', action: truthy(values.remove || '') ? 'archive' : 'upsert',
        team_id: teamId, team_name: teamName, season_name: 'Current Season',
      } });
    } else if (section === 'member') {
      const name = values.player_name || '';
      const number = values.player_number || '';
      const existing = existingTeam?.roster.find((member) =>
        member.role === 'player' && member.name.toLowerCase() === name.toLowerCase()
        && member.number === number);
      records.push({ row: index + 1, values: {
        record_type: 'member', action: truthy(values.remove || '') ? 'archive' : 'upsert',
        team_id: teamId, user_id: existing?.playerId || slug(`${teamId}-${name}-${number}`),
        role: 'player', name, number, password: values.player_password || '',
      } });
    }
  }
  return records;
}

function addIssue(issues: TeamCsvIssue[], row: number, message: string, severity: 'error' | 'warning' = 'error') {
  issues.push({ row, severity, message });
}

async function fingerprint(csv: string, operations: ImportOperation[]): Promise<string> {
  const state = operations.map((operation) => ({
    row: operation.row, kind: operation.kind, action: operation.action,
    teamId: operation.teamId,
    userId: operation.kind === 'member' ? operation.userId : undefined,
    revision: operation.before?.revision ?? 0,
    userRevision: operation.kind === 'member' ? operation.before?.userRevision ?? 0 : undefined,
  }));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${csv}\n${JSON.stringify(state)}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function planTeamCsvImport(database: SqliteDatabaseAdapter, csv: string): Promise<ImportPlan> {
  const existingTeams = await new SqliteTeamRepository(database).listForAdministration(true);
  const modern = parseDelimited(csv);
  const legacy = legacyRecords(csv, existingTeams);
  const format = legacy ? 'legacy' : 'modern';
  const records = legacy || modern.records;
  const issues: TeamCsvIssue[] = [];
  if (modern.issue && !legacy) addIssue(issues, 1, modern.issue);
  if (!legacy) {
    REQUIRED_HEADERS.filter((header) => !modern.headers.includes(header)).forEach((header) =>
      addIssue(issues, 1, `Missing required column: ${header}.`));
  } else {
    addIssue(issues, 1, 'Legacy block CSV detected. Review the generated stable IDs before importing.', 'warning');
  }
  if (!records.length) addIssue(issues, 1, 'The CSV does not contain any data rows.');
  if (records.length > MAX_RECORDS) addIssue(issues, 1, `A single import can contain at most ${MAX_RECORDS} records.`);

  const operations: ImportOperation[] = [];
  const teamsById = new Map(existingTeams.map((team) => [team.id, team]));
  const activeSeasonTeams = new Set((await database.all<{ team_id: string }>(
    "SELECT team_id FROM team_seasons WHERE status = 'active'",
  )).map((season) => season.team_id));
  const memberships = new Map(existingTeams.flatMap((team) => team.roster.map(
    (member) => [`${team.id}\u0000${member.playerId}`, { team, member }] as const,
  )));
  const activeMemberships = new Map(existingTeams.flatMap((team) => team.roster
    .filter((member) => member.active)
    .map((member) => [member.playerId, { team, member }] as const)));
  const databaseUsers = new Map((await database.all<{ id: string; role: string }>(
    'SELECT id, role FROM users',
  )).map((user) => [user.id, user]));
  const jerseyOwners = new Map(existingTeams.flatMap((team) => team.roster
    .filter((member) => member.active && member.role === 'player' && member.number)
    .map((member) => [`${team.id}\u0000${member.number}`, member.playerId] as const)));
  const seen = new Set<string>();

  const orderedRecords = records.slice(0, MAX_RECORDS).sort((left, right) => {
    const leftTeam = left.values.record_type?.trim().toLowerCase() === 'team' ? 0 : 1;
    const rightTeam = right.values.record_type?.trim().toLowerCase() === 'team' ? 0 : 1;
    return leftTeam - rightTeam || left.row - right.row;
  });
  for (const record of orderedRecords) {
    const values = record.values;
    const kind = values.record_type?.trim().toLowerCase();
    const requestedAction = values.action?.trim().toLowerCase() || 'upsert';
    const teamId = values.team_id?.trim().toLowerCase();
    if (kind !== 'team' && kind !== 'member') { addIssue(issues, record.row, 'record_type must be team or member.'); continue; }
    if (!['upsert', 'archive'].includes(requestedAction)) { addIssue(issues, record.row, 'action must be upsert or archive.'); continue; }
    if (!ID_PATTERN.test(teamId)) { addIssue(issues, record.row, 'team_id must use 2–80 lowercase letters, numbers, or hyphens.'); continue; }
    const duplicateKey = kind === 'team' ? `team:${teamId}` : `member:${values.user_id?.trim().toLowerCase()}`;
    if (seen.has(duplicateKey)) { addIssue(issues, record.row, 'This record appears more than once in the file.'); continue; }
    seen.add(duplicateKey);

    if (kind === 'team') {
      const before = teamsById.get(teamId);
      const name = values.team_name?.trim();
      if (requestedAction === 'archive') {
        if (!before) { addIssue(issues, record.row, `Team ${teamId} does not exist and cannot be archived.`); continue; }
        operations.push({ row: record.row, kind, action: before.active ? 'archive' : 'unchanged', label: before.name, teamId, name: before.name, seasonName: before.activeSeasonName || '', before });
        teamsById.set(teamId, { ...before, active: false });
        activeSeasonTeams.delete(teamId);
        continue;
      }
      if (!name || name.length > 100) { addIssue(issues, record.row, 'team_name is required and must be 100 characters or fewer.'); continue; }
      const seasonName = values.season_name?.trim() || before?.activeSeasonName || '';
      if ((!before || !before.activeSeasonId) && (!seasonName || seasonName.length > 120)) {
        addIssue(issues, record.row, 'season_name is required for a team without an active season and must be 120 characters or fewer.');
        continue;
      }
      const duplicateName = [...teamsById.values()].find((team) =>
        team.id !== teamId && team.active && team.name.trim().toLowerCase() === name.toLowerCase());
      if (duplicateName) {
        addIssue(issues, record.row, `An active team named ${name} already exists as ${duplicateName.id}.`);
        continue;
      }
      const action: ImportAction = !before ? 'create' : !before.active ? 'restore'
        : before.name !== name ? 'update' : 'unchanged';
      const operation: TeamOperation = { row: record.row, kind, action, label: name, teamId, name, seasonName, before };
      operations.push(operation);
      const planned: TeamOption = before
        ? { ...before, name, displayName: before.activeSeasonName ? `${name} — ${before.activeSeasonName}` : `${name} — No active season`, active: true }
        : { id: teamId, name, displayName: `${name} — ${seasonName}`, activeSeasonId: null, activeSeasonName: seasonName, revision: 0, active: true, roster: [] };
      teamsById.set(teamId, planned);
      activeSeasonTeams.add(teamId);
      continue;
    }

    const userId = values.user_id?.trim().toLowerCase();
    if (!ID_PATTERN.test(userId)) { addIssue(issues, record.row, 'user_id must use 2–80 lowercase letters, numbers, or hyphens.'); continue; }
    const team = teamsById.get(teamId);
    if (!team) { addIssue(issues, record.row, `Team ${teamId} is not in the database or this file.`); continue; }
    if (!team.active && requestedAction !== 'archive') { addIssue(issues, record.row, `Team ${teamId} is archived by this file. Restore the team before updating accounts.`); continue; }
    if (requestedAction !== 'archive' && !activeSeasonTeams.has(teamId)) {
      addIssue(issues, record.row, `Team ${teamId} does not have an active season. Create a season before importing accounts.`);
      continue;
    }
    const existingUser = databaseUsers.get(userId);
    const existingMembership = memberships.get(`${teamId}\u0000${userId}`);
    const activeMembership = activeMemberships.get(userId);
    const before = existingMembership?.member;
    if (existingUser && !before) {
      addIssue(
        issues,
        record.row,
        activeMembership
          ? `Account ${userId} already belongs to ${activeMembership.team.name}. Use Transfer player in Admin Tools.`
          : `Account ${userId} already exists without a membership on this team. Use Add unassigned player in Admin Tools.`,
      );
      continue;
    }
    if (before && activeMembership && activeMembership.team.id !== teamId) {
      addIssue(issues, record.row, `Account ${userId} already belongs to ${activeMembership.team.name}. Use Transfer player in Admin Tools.`);
      continue;
    }
    if (requestedAction === 'archive') {
      if (!before) { addIssue(issues, record.row, `Account ${userId} does not exist and cannot be archived.`); continue; }
      operations.push({ row: record.row, kind, action: before.active ? 'archive' : 'unchanged', label: before.name, teamId, userId, role: before.role, name: before.name, number: before.number, password: '', before });
      if (before.role === 'player' && before.number) jerseyOwners.delete(`${teamId}\u0000${before.number}`);
      continue;
    }
    const role = values.role?.trim().toLowerCase();
    const name = values.name?.trim();
    const number = role === 'player' ? values.number?.trim() || '' : '';
    const password = values.password || '';
    if (role !== 'player' && role !== 'coach') { addIssue(issues, record.row, 'role must be player or coach.'); continue; }
    if (!name || name.length > 100) { addIssue(issues, record.row, 'name is required and must be 100 characters or fewer.'); continue; }
    if (role === 'player' && (!number || number.length > 12)) {
      addIssue(issues, record.row, 'number is required for a player and must be 12 characters or fewer.');
      continue;
    }
    if (!before && password.length < 8) { addIssue(issues, record.row, 'A temporary password of at least 8 characters is required for a new account.'); continue; }
    if (password && password.length < 8) { addIssue(issues, record.row, 'Temporary passwords must contain at least 8 characters.'); continue; }
    if ((before && before.role !== role) || (existingUser && existingUser.role !== role)) {
      addIssue(issues, record.row, 'An existing account role cannot be changed by CSV.');
      continue;
    }
    if (role === 'player') {
      const owner = jerseyOwners.get(`${teamId}\u0000${number}`);
      if (owner && owner !== userId) { addIssue(issues, record.row, `Player number ${number} is already assigned to ${owner}.`); continue; }
      if (before?.number && before.number !== number) jerseyOwners.delete(`${teamId}\u0000${before.number}`);
      jerseyOwners.set(`${teamId}\u0000${number}`, userId);
    }
    const action: ImportAction = !before ? 'create' : !before.active ? 'restore'
      : before.name !== name || before.number !== number || Boolean(password) ? 'update' : 'unchanged';
    const operation: MemberOperation = { row: record.row, kind, action, label: `${name}${role === 'player' ? ` #${number}` : ''}`, teamId, userId, role, name, number, password, before };
    operations.push(operation);
    const plannedMember: TeamOption['roster'][number] = before
      ? { ...before, name, number, active: true }
      : {
          playerId: userId,
          name,
          number,
          role: role as 'player' | 'coach',
          revision: 0,
          userRevision: 0,
          active: true,
          seasonId: null,
        };
    memberships.set(`${teamId}\u0000${userId}`, { team, member: plannedMember });
    activeMemberships.set(userId, { team, member: plannedMember });
    databaseUsers.set(userId, { id: userId, role });
  }

  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  const actionCount = (action: ImportAction) => operations.filter((operation) => operation.action === action).length;
  const changes = operations.filter((operation) => operation.action !== 'unchanged').length;
  const preview: TeamCsvPreview = {
    valid: errors === 0,
    fingerprint: await fingerprint(csv, operations),
    format,
    summary: {
      rows: records.length, changes,
      teams: operations.filter((operation) => operation.kind === 'team').length,
      members: operations.filter((operation) => operation.kind === 'member').length,
      creates: actionCount('create'), updates: actionCount('update'), restores: actionCount('restore'),
      archives: actionCount('archive'), unchanged: actionCount('unchanged'), errors, warnings,
    },
    issues,
    operations: operations.slice().sort((left, right) => left.row - right.row).map((operation) => ({
      row: operation.row, kind: operation.kind, action: operation.action,
      label: operation.label, teamId: operation.teamId,
      ...(operation.kind === 'member' ? { userId: operation.userId } : {}),
    })),
  };
  return { preview, operations };
}

function auditCommand(actorUserId: string, importId: string, preview: TeamCsvPreview): SqlCommand {
  return {
    sql: `INSERT INTO audit_log
      (id, actor_user_id, action, entity_type, entity_id, before_json, after_json, created_at)
      VALUES (?1, ?2, 'import', 'team_csv', ?3, NULL, ?4, ?5)`,
    params: [crypto.randomUUID(), actorUserId, importId, JSON.stringify({ summary: preview.summary, operations: preview.operations }), new Date().toISOString()],
  };
}

export async function commitTeamCsvImport(
  database: SqliteDatabaseAdapter,
  csv: string,
  expectedFingerprint: string,
  actorUserId: string,
): Promise<TeamCsvPreview> {
  const plan = await planTeamCsvImport(database, csv);
  if (!plan.preview.valid) throw new TeamCsvValidationError('The CSV contains validation errors. Preview it again and correct the file.');
  if (!expectedFingerprint || expectedFingerprint !== plan.preview.fingerprint) {
    throw new TeamCsvStalePreviewError('The database changed after this preview. Preview the CSV again before importing.');
  }
  const commands: SqlCommand[] = [];
  const now = new Date().toISOString();
  const activeSeasons = new Map((await database.all<{ id: string; team_id: string }>(
    "SELECT id, team_id FROM team_seasons WHERE status = 'active'",
  )).map((season) => [season.team_id, season.id]));
  for (const operation of plan.operations) {
    if (operation.action === 'unchanged') continue;
    if (operation.kind === 'team') {
      if (operation.action === 'create') {
        const seasonId = crypto.randomUUID();
        activeSeasons.set(operation.teamId, seasonId);
        commands.push({ sql: `INSERT INTO teams
          (id, name, revision, active, created_at, updated_at)
          VALUES (?1, ?2, 1, 1, ?3, ?3)`, params: [operation.teamId, operation.name, now] });
        commands.push({ sql: `INSERT INTO team_seasons
          (id, team_id, name, status, starts_on, created_by, created_at, updated_at)
          VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?6)`,
          params: [seasonId, operation.teamId, operation.seasonName, now.slice(0, 10), actorUserId, now] });
      } else if (operation.action === 'archive') {
        commands.push({ sql: `UPDATE teams SET active = 0, revision = revision + 1,
          archived_at = ?2, archived_by = ?3, updated_at = ?2 WHERE id = ?1 AND revision = ?4`,
          params: [operation.teamId, now, actorUserId, operation.before!.revision] });
      } else {
        commands.push({ sql: `UPDATE teams SET name = ?2, active = 1,
          archived_at = NULL, archived_by = NULL, revision = revision + 1, updated_at = ?3
          WHERE id = ?1 AND revision = ?4`, params: [operation.teamId, operation.name, now, operation.before!.revision] });
        if (!activeSeasons.has(operation.teamId)) {
          const seasonId = crypto.randomUUID();
          activeSeasons.set(operation.teamId, seasonId);
          commands.push({ sql: `INSERT INTO team_seasons
            (id, team_id, name, status, starts_on, created_by, created_at, updated_at)
            VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?6)`,
            params: [seasonId, operation.teamId, operation.seasonName, now.slice(0, 10), actorUserId, now] });
        }
      }
      continue;
    }
    const seasonId = activeSeasons.get(operation.teamId);
    if (operation.action !== 'archive' && !seasonId) {
      throw new TeamCsvValidationError(`Team ${operation.teamId} does not have an active season.`);
    }
    if (operation.action === 'create') {
      const credentials = await createPasswordHash(operation.password);
      commands.push({ sql: `INSERT INTO users
        (id, username, display_name, role, password_hash, password_salt,
         password_iterations, active, revision, created_at, updated_at,
         must_change_password, password_changed_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 1, ?8, ?8, 1, ?8)`,
        params: [operation.userId, operation.userId, operation.name, operation.role, credentials.hash, credentials.salt, credentials.iterations, now] });
      commands.push({ sql: `INSERT INTO team_memberships
        (team_id, user_id, team_role, jersey_number, revision, active, created_at, updated_at, season_id)
        VALUES (?1, ?2, ?3, ?4, 1, 1, ?5, ?5, ?6)`,
        params: [operation.teamId, operation.userId, operation.role, operation.number, now, seasonId] });
      commands.push({ sql: `INSERT INTO season_memberships
        (season_id, team_id, user_id, team_role, display_name_snapshot,
         jersey_number_snapshot, status, joined_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7)`,
        params: [seasonId, operation.teamId, operation.userId, operation.role,
          operation.name, operation.number, now] });
    } else if (operation.action === 'archive') {
      commands.push({ sql: `UPDATE team_memberships SET active = 0, revision = revision + 1,
        archived_at = ?3, archived_by = ?4, updated_at = ?3
        WHERE team_id = ?1 AND user_id = ?2 AND revision = ?5`, params: [operation.teamId, operation.userId, now, actorUserId, operation.before!.revision] });
      commands.push({ sql: `UPDATE users SET active = 0, archived_at = ?2, archived_by = ?3,
        revision = revision + 1, updated_at = ?2 WHERE id = ?1
          AND NOT EXISTS (SELECT 1 FROM team_memberships WHERE user_id = ?1 AND active = 1)`,
        params: [operation.userId, now, actorUserId] });
      commands.push({ sql: `UPDATE season_memberships SET status = 'removed', removed_at = ?3,
        removed_by = ?4 WHERE season_id = ?1 AND user_id = ?2`,
        params: [operation.before!.seasonId, operation.userId, now, actorUserId] });
      commands.push({ sql: `UPDATE assignment_recipients SET withdrawn_at = ?3, lock_active = 0,
        released_at = COALESCE(released_at, ?3)
        WHERE player_id = ?2 AND assignment_id IN (
          SELECT id FROM practice_assignments
           WHERE season_id = ?1 AND status = 'active'
             AND closed_at IS NULL AND cancelled_at IS NULL
        ) AND withdrawn_at IS NULL`, params: [operation.before!.seasonId, operation.userId, now] });
      commands.push({ sql: `UPDATE attempts SET outcome = 'abandoned', lifecycle_status = 'abandoned',
        abandon_reason = 'removed_from_team', completed_at = COALESCE(completed_at, ?3),
        updated_at = ?3 WHERE season_id = ?1 AND player_id = ?2
          AND lifecycle_status = 'incomplete'`,
        params: [operation.before!.seasonId, operation.userId, now] });
      commands.push({ sql: 'DELETE FROM sessions WHERE user_id = ?1', params: [operation.userId] });
    } else {
      commands.push({ sql: `UPDATE team_memberships SET jersey_number = ?3, active = 1,
        archived_at = NULL, archived_by = NULL, revision = revision + 1, updated_at = ?4,
        season_id = ?6 WHERE team_id = ?1 AND user_id = ?2 AND revision = ?5`,
        params: [operation.teamId, operation.userId, operation.number, now, operation.before!.revision, seasonId] });
      commands.push({ sql: `INSERT INTO season_memberships
        (season_id, team_id, user_id, team_role, display_name_snapshot,
         jersey_number_snapshot, status, joined_at, removed_at, removed_by)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7, NULL, NULL)
        ON CONFLICT(season_id, user_id) DO UPDATE SET status = 'active',
          removed_at = NULL, removed_by = NULL,
          display_name_snapshot = excluded.display_name_snapshot,
          jersey_number_snapshot = excluded.jersey_number_snapshot`,
        params: [seasonId, operation.teamId, operation.userId, operation.role,
          operation.name, operation.number, now] });
      if (operation.password) {
        const credentials = await createPasswordHash(operation.password);
        commands.push({ sql: `UPDATE users SET display_name = ?2, active = 1,
          archived_at = NULL, archived_by = NULL, password_hash = ?3, password_salt = ?4,
          password_iterations = ?5, must_change_password = 1,
          failed_login_attempts = 0, locked_until = NULL,
          password_changed_at = ?6, revision = revision + 1,
          updated_at = ?6 WHERE id = ?1`,
          params: [operation.userId, operation.name, credentials.hash, credentials.salt, credentials.iterations, now] });
        commands.push({ sql: 'DELETE FROM sessions WHERE user_id = ?1', params: [operation.userId] });
      } else {
        commands.push({ sql: `UPDATE users SET display_name = ?2, active = 1,
          archived_at = NULL, archived_by = NULL, revision = revision + 1, updated_at = ?3 WHERE id = ?1`,
          params: [operation.userId, operation.name, now] });
      }
    }
  }
  commands.push(auditCommand(actorUserId, crypto.randomUUID(), plan.preview));
  await database.batch(commands);
  return plan.preview;
}
