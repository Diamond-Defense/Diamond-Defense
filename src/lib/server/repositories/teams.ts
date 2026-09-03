import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';
import {
  createPasswordHash,
  validateAccountPassword,
} from '$lib/server/security/passwords';
import { writeAudit } from './audit';
import {
  RecordNotFoundError,
  RecordValidationError,
  RevisionConflictError,
} from './errors';
import { SqliteSeasonRepository } from './seasons';

interface TeamRow {
  id: string;
  name: string;
  revision: number;
  active: number;
  archived_at: string | null;
  active_season_id: string | null;
  active_season_name: string | null;
}

interface MemberRow {
  team_id: string;
  user_id: string;
  display_name: string;
  role: 'player' | 'coach';
  jersey_number: string;
  membership_revision: number;
  user_revision: number;
  active: number;
  season_id: string | null;
}

export interface TeamMemberRecord {
  playerId: string;
  name: string;
  number: string;
  role: 'player' | 'coach';
  revision: number;
  userRevision: number;
  active: boolean;
  seasonId: string | null;
}

export interface TeamOption {
  id: string;
  name: string;
  displayName: string;
  activeSeasonId: string | null;
  activeSeasonName: string | null;
  revision: number;
  active: boolean;
  archivedAt?: string | null;
  roster: TeamMemberRecord[];
}

export interface TeamInput {
  id?: string;
  name: string;
  seasonName?: string;
}

export interface MemberInput {
  userId?: string;
  name: string;
  number?: string;
  role: 'player' | 'coach';
  password?: string;
}

export interface UnassignedPlayerRecord {
  userId: string;
  name: string;
  userRevision: number;
  previousTeams: string[];
}

export interface ExistingPlayerInput {
  userId: string;
  number: string;
}

export interface AdvanceRosterInput {
  destinationTeamId?: string;
  destinationTeamName?: string;
  seasonName?: string;
  startsOn?: string;
  endsOn?: string;
  members: Array<{ userId: string; number?: string }>;
}

export interface TeamDeletionPreview {
  teamId: string;
  teamName: string;
  seasons: number;
  memberships: number;
  players: number;
  coaches: number;
  assignments: number;
  attempts: number;
}

function validateId(value: unknown, label: string): string {
  const id = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id)) {
    throw new RecordValidationError(`${label} must use 2–80 lowercase letters, numbers, or hyphens.`);
  }
  return id;
}

function validateName(value: unknown, label: string): string {
  const name = String(value || '').trim();
  if (!name || name.length > 100) {
    throw new RecordValidationError(`${label} is required and must be 100 characters or fewer.`);
  }
  return name;
}

function validateSeasonName(value: unknown): string {
  const name = String(value || '').trim() || 'Current Season';
  if (name.length > 120) {
    throw new RecordValidationError('Season name must be 120 characters or fewer.');
  }
  return name;
}

function validatePassword(value: unknown, required: boolean): string {
  const password = String(value || '');
  if (!password && !required) return '';
  try { return validateAccountPassword(password); }
  catch (error) {
    throw new RecordValidationError(error instanceof Error ? error.message : String(error));
  }
}

function validateNumber(value: unknown): string {
  const number = String(value || '').trim();
  if (!number || number.length > 12) {
    throw new RecordValidationError('Player number is required and must be 12 characters or fewer.');
  }
  return number;
}

function validateDate(value: unknown, label: string): string | null {
  const date = String(value || '').trim();
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RecordValidationError(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new RecordValidationError(`${label} is invalid.`);
  }
  return date;
}

function mapTeam(team: TeamRow, members: MemberRow[]): TeamOption {
  const seasonName = String(team.active_season_name || '').trim();
  const alreadyCombined = seasonName.toLocaleLowerCase().startsWith(
    `${team.name.trim().toLocaleLowerCase()} —`,
  );
  return {
    id: team.id,
    name: team.name,
    displayName: seasonName
      ? alreadyCombined ? seasonName : `${team.name} — ${seasonName}`
      : `${team.name} — No active season`,
    activeSeasonId: team.active_season_id,
    activeSeasonName: seasonName || null,
    revision: Number(team.revision),
    active: Boolean(team.active),
    archivedAt: team.archived_at,
    roster: members
      .filter((member) => member.team_id === team.id)
      .map((member) => ({
        playerId: member.user_id,
        name: member.display_name,
        number: member.jersey_number,
        role: member.role,
        revision: Number(member.membership_revision),
        userRevision: Number(member.user_revision),
        active: Boolean(member.active),
        seasonId: member.season_id,
      })),
  };
}

export class SqliteTeamRepository {
  constructor(private readonly database: SqliteDatabaseAdapter) {}

  private async rows(includeArchived: boolean): Promise<{ teams: TeamRow[]; members: MemberRow[] }> {
    const teams = await this.database.all<TeamRow>(
      `SELECT t.id, t.name, t.revision, t.active, t.archived_at,
              active_season.id AS active_season_id,
              active_season.name AS active_season_name
         FROM teams t
         LEFT JOIN team_seasons active_season
           ON active_season.team_id = t.id AND active_season.status = 'active'
        ${includeArchived ? '' : 'WHERE t.active = 1'}
        ORDER BY t.name, active_season.starts_on DESC`,
    );
    const members = await this.database.all<MemberRow>(
      `SELECT tm.team_id, tm.user_id, u.display_name, u.role,
              tm.jersey_number, tm.revision AS membership_revision,
              u.revision AS user_revision,
              tm.season_id,
              CASE WHEN tm.active = 1 AND u.active = 1 THEN 1 ELSE 0 END AS active
         FROM team_memberships tm
         JOIN users u ON u.id = tm.user_id
        ${includeArchived ? '' : "WHERE tm.active = 1 AND u.active = 1"}
        ORDER BY tm.team_id, tm.team_role, CAST(tm.jersey_number AS INTEGER), u.display_name`,
    );
    return { teams, members };
  }

  async listOptions(): Promise<TeamOption[]> {
    const { teams, members } = await this.rows(false);
    return teams
      .filter((team) => Boolean(team.active_season_id))
      .map((team) => mapTeam(team, members.filter((member) => member.role === 'player')));
  }

  async listCoachOptions(): Promise<TeamOption[]> {
    const { teams, members } = await this.rows(false);
    return teams
      .filter((team) => Boolean(team.active_season_id))
      .map((team) =>
        mapTeam(
          team,
          members.filter(
            (member) => member.role === 'coach' && member.team_id === team.id,
          ),
        ),
      )
      .filter((team) => team.roster.length > 0);
  }

  async listForAdministration(includeArchived = false): Promise<TeamOption[]> {
    const { teams, members } = await this.rows(includeArchived);
    return teams.map((team) => mapTeam(team, members));
  }

  async get(id: string, includeArchived = false): Promise<TeamOption | null> {
    const { teams, members } = await this.rows(includeArchived);
    const team = teams.find((item) => item.id === id);
    return team ? mapTeam(team, members) : null;
  }

  async create(input: TeamInput, actorUserId: string): Promise<TeamOption> {
    const id = input.id ? validateId(input.id, 'Team ID') : `team-${crypto.randomUUID()}`;
    const name = validateName(input.name, 'Team name');
    const seasonName = validateSeasonName(input.seasonName);
    await this.ensureTeamNameAvailable(name);
    const now = new Date().toISOString();
    const result = await this.database.execute(
      `INSERT OR IGNORE INTO teams
        (id, name, revision, active, created_at, updated_at)
       VALUES (?1, ?2, 1, 1, ?3, ?3)`,
      [id, name, now],
    );
    if (!result.changes) throw new RecordValidationError('A team with that ID already exists.');
    await new SqliteSeasonRepository(this.database).create(
      id,
      {
        name: seasonName,
        startsOn: now.slice(0, 10),
      },
      actorUserId,
    );
    const created = await this.get(id, true);
    await writeAudit(this.database, actorUserId, 'create', 'team', id, null, created);
    return created!;
  }

  async update(id: string, input: Partial<TeamInput>, expectedRevision: number, actorUserId: string): Promise<TeamOption> {
    const before = await this.get(id, true);
    if (!before) throw new RecordNotFoundError('Team not found.');
    const name = validateName(input.name ?? before.name, 'Team name');
    await this.ensureTeamNameAvailable(name, id);
    const result = await this.database.execute(
      `UPDATE teams SET name = ?2, revision = revision + 1, updated_at = ?3
        WHERE id = ?1 AND revision = ?4`,
      [id, name, new Date().toISOString(), expectedRevision],
    );
    if (!result.changes) throw new RevisionConflictError();
    const updated = await this.get(id, true);
    await writeAudit(this.database, actorUserId, 'update', 'team', id, before, updated);
    return updated!;
  }

  private async ensureTeamNameAvailable(name: string, excludedId = ''): Promise<void> {
    const duplicate = await this.database.one<{ id: string }>(
      `SELECT id FROM teams
        WHERE active = 1 AND lower(trim(name)) = lower(trim(?1)) AND id <> ?2
        LIMIT 1`,
      [name, excludedId],
    );
    if (duplicate) {
      throw new RecordValidationError('An active team with that name already exists. Select it or use a different name.');
    }
  }

  async setActive(id: string, active: boolean, expectedRevision: number, actorUserId: string): Promise<TeamOption> {
    const before = await this.get(id, true);
    if (!before) throw new RecordNotFoundError('Team not found.');
    if (active) await this.ensureTeamNameAvailable(before.name, id);
    const now = new Date().toISOString();
    const result = await this.database.execute(
      `UPDATE teams SET active = ?2, revision = revision + 1, updated_at = ?3,
                        archived_at = ?4, archived_by = ?5
        WHERE id = ?1 AND revision = ?6`,
      [id, active ? 1 : 0, now, active ? null : now, active ? null : actorUserId, expectedRevision],
    );
    if (!result.changes) throw new RevisionConflictError();
    const updated = await this.get(id, true);
    await writeAudit(this.database, actorUserId, active ? 'restore' : 'archive', 'team', id, before, updated);
    return updated!;
  }

  async deletionPreview(id: string): Promise<TeamDeletionPreview> {
    const team = await this.get(id, true);
    if (!team) throw new RecordNotFoundError('Team not found.');
    const counts = await this.database.one<{
      seasons: number;
      memberships: number;
      players: number;
      coaches: number;
      assignments: number;
      attempts: number;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM team_seasons WHERE team_id = ?1) AS seasons,
        (SELECT COUNT(*) FROM team_memberships WHERE team_id = ?1) AS memberships,
        (SELECT COUNT(DISTINCT user_id) FROM team_memberships
          WHERE team_id = ?1 AND team_role = 'player' AND active = 1) AS players,
        (SELECT COUNT(DISTINCT user_id) FROM team_memberships
          WHERE team_id = ?1 AND team_role = 'coach' AND active = 1) AS coaches,
        (SELECT COUNT(*) FROM practice_assignments WHERE team_id = ?1) AS assignments,
        (SELECT COUNT(*) FROM attempts WHERE team_id = ?1) AS attempts`,
      [id],
    );
    return {
      teamId: id,
      teamName: team.name,
      seasons: Number(counts?.seasons || 0),
      memberships: Number(counts?.memberships || 0),
      players: Number(counts?.players || 0),
      coaches: Number(counts?.coaches || 0),
      assignments: Number(counts?.assignments || 0),
      attempts: Number(counts?.attempts || 0),
    };
  }

  async deletePermanently(
    id: string,
    actorUserId: string,
    deletePlayers: boolean,
  ): Promise<TeamDeletionPreview> {
    const team = await this.get(id, true);
    if (!team) throw new RecordNotFoundError('Team not found.');
    if (await new SqliteSeasonRepository(this.database).active(id)) {
      throw new RecordValidationError('Close the active season before permanently deleting the team.');
    }
    const counts = await this.deletionPreview(id);
    const now = new Date().toISOString();
    const playerIds = await this.database.all<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM team_memberships
        WHERE team_id = ?1 AND team_role = 'player' AND active = 1`,
      [id],
    );
    const assignedUserIds = await this.database.all<{ user_id: string }>(
      'SELECT DISTINCT user_id FROM team_memberships WHERE team_id = ?1 AND active = 1',
      [id],
    );
    const commands: Array<{ sql: string; params?: unknown[] }> = assignedUserIds.map(
      ({ user_id: userId }) => ({ sql: 'DELETE FROM sessions WHERE user_id = ?1', params: [userId] }),
    );
    commands.push(
      {
        sql: `DELETE FROM assignment_progress
               WHERE assignment_id IN (
                 SELECT id FROM practice_assignments WHERE team_id = ?1
               )`,
        params: [id],
      },
      {
        sql: `DELETE FROM assignment_situations
               WHERE assignment_id IN (
                 SELECT id FROM practice_assignments WHERE team_id = ?1
               )`,
        params: [id],
      },
      {
        sql: `DELETE FROM assignment_recipients
               WHERE assignment_id IN (
                 SELECT id FROM practice_assignments WHERE team_id = ?1
               )`,
        params: [id],
      },
      { sql: 'DELETE FROM attempts WHERE team_id = ?1', params: [id] },
      { sql: 'DELETE FROM practice_assignments WHERE team_id = ?1', params: [id] },
      { sql: 'DELETE FROM season_memberships WHERE team_id = ?1', params: [id] },
      { sql: 'DELETE FROM team_memberships WHERE team_id = ?1', params: [id] },
      { sql: 'DELETE FROM team_seasons WHERE team_id = ?1', params: [id] },
    );
    if (deletePlayers && playerIds.length) {
      for (const { user_id: playerId } of playerIds) {
        commands.push(
          { sql: 'DELETE FROM sessions WHERE user_id = ?1', params: [playerId] },
          {
            sql: `DELETE FROM audit_log
                   WHERE actor_user_id = ?1 OR entity_id = ?1 OR entity_id LIKE ?2
                      OR before_json LIKE ?3 OR after_json LIKE ?3`,
            params: [playerId, `%:${playerId}`, `%${playerId}%`],
          },
          { sql: "DELETE FROM users WHERE id = ?1 AND role = 'player'", params: [playerId] },
        );
      }
    }
    commands.push(
      { sql: 'DELETE FROM teams WHERE id = ?1', params: [id] },
      {
        sql: `INSERT INTO deletion_audit
          (id, action, actor_role, affected_counts_json, created_at)
         VALUES (?1, ?2, 'admin', ?3, ?4)`,
        params: [crypto.randomUUID(), deletePlayers
          ? 'permanent_team_and_player_deletion'
          : 'permanent_team_deletion', JSON.stringify({
          seasons: counts.seasons,
          memberships: counts.memberships,
          players: counts.players,
          coaches: counts.coaches,
          assignments: counts.assignments,
          attempts: counts.attempts,
        }), now],
      },
    );
    await this.database.batch(commands);
    return counts;
  }

  async createMember(teamId: string, input: MemberInput, actorUserId: string): Promise<TeamMemberRecord> {
    if (!(await this.get(teamId, true))) throw new RecordNotFoundError('Team not found.');
    const userId = input.userId
      ? validateId(input.userId, 'User ID')
      : `${input.role === 'coach' ? 'coach' : 'player'}-${crypto.randomUUID()}`;
    const name = validateName(input.name, input.role === 'coach' ? 'Coach name' : 'Player name');
    const role = input.role === 'coach' ? 'coach' : 'player';
    const number = role === 'player' ? validateNumber(input.number) : '';
    const password = validatePassword(input.password, true);
    const existing = await this.database.one<{ id: string }>('SELECT id FROM users WHERE id = ?1', [userId]);
    if (existing) throw new RecordValidationError('A user with that ID already exists. Restore or update it instead.');
    const credentials = await createPasswordHash(password);
    const now = new Date().toISOString();
    const season = await new SqliteSeasonRepository(this.database).active(teamId);
    if (!season) throw new RecordValidationError('Create an active season before adding team members.');
    if (role === 'player') await this.ensureNumberAvailable(teamId, number, userId);
    await this.database.execute(
      `INSERT INTO users
        (id, username, display_name, role, password_hash, password_salt,
         password_iterations, active, revision, created_at, updated_at,
         must_change_password, password_changed_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 1, ?8, ?8, 1, ?8)`,
      [userId, userId, name, role, credentials.hash, credentials.salt, credentials.iterations, now],
    );
    await this.database.execute(
      `INSERT INTO team_memberships
        (team_id, user_id, team_role, jersey_number, revision, active, created_at, updated_at, season_id)
       VALUES (?1, ?2, ?3, ?4, 1, 1, ?5, ?5, ?6)`,
      [teamId, userId, role, number, now, season.id],
    );
    await this.database.execute(
      `INSERT INTO season_memberships
        (season_id, team_id, user_id, team_role, display_name_snapshot,
         jersey_number_snapshot, status, joined_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7)`,
      [season.id, teamId, userId, role, name, number, now],
    );
    const member = await this.getMember(teamId, userId, true);
    await writeAudit(this.database, actorUserId, 'create', 'membership', `${teamId}:${userId}`, null, member);
    return member!;
  }

  async listUnassignedPlayers(): Promise<UnassignedPlayerRecord[]> {
    const rows = await this.database.all<{
      id: string;
      display_name: string;
      revision: number;
      previous_teams: string | null;
    }>(
      `SELECT u.id, u.display_name, u.revision,
              GROUP_CONCAT(DISTINCT t.name) AS previous_teams
         FROM users u
         LEFT JOIN team_memberships history ON history.user_id = u.id
         LEFT JOIN teams t ON t.id = history.team_id
        WHERE u.role = 'player'
          AND NOT EXISTS (
            SELECT 1 FROM team_memberships active_membership
             WHERE active_membership.user_id = u.id
               AND active_membership.team_role = 'player'
               AND active_membership.active = 1
          )
        GROUP BY u.id, u.display_name, u.revision
        ORDER BY u.display_name, u.id`,
    );
    return rows.map((row) => ({
      userId: row.id,
      name: row.display_name,
      userRevision: Number(row.revision),
      previousTeams: String(row.previous_teams || '').split(',').filter(Boolean),
    }));
  }

  private async activeSeasonFor(teamId: string) {
    const team = await this.get(teamId, true);
    if (!team) throw new RecordNotFoundError('Destination team not found.');
    if (!team.active) throw new RecordValidationError('Restore the destination team before adding players.');
    const season = await new SqliteSeasonRepository(this.database).active(teamId);
    if (!season) throw new RecordValidationError('Create an active season for the destination team first.');
    return { team, season };
  }

  private async ensureNumberAvailable(teamId: string, number: string, userId: string): Promise<void> {
    const conflict = await this.database.one<{ user_id: string }>(
      `SELECT user_id FROM team_memberships
        WHERE team_id = ?1 AND team_role = 'player' AND active = 1
          AND jersey_number = ?2 AND user_id <> ?3`,
      [teamId, number, userId],
    );
    if (conflict) throw new RecordValidationError(`Player number ${number} is already active on the destination team.`);
  }

  async addExistingPlayer(
    teamId: string,
    input: ExistingPlayerInput,
    actorUserId: string,
  ): Promise<TeamMemberRecord> {
    const userId = validateId(input.userId, 'Player ID');
    const number = validateNumber(input.number);
    const { season } = await this.activeSeasonFor(teamId);
    const player = await this.database.one<{ id: string; display_name: string; role: string }>(
      'SELECT id, display_name, role FROM users WHERE id = ?1', [userId],
    );
    if (!player || player.role !== 'player') throw new RecordNotFoundError('Player account not found.');
    const activeMembership = await this.database.one<{ team_id: string }>(
      `SELECT team_id FROM team_memberships
        WHERE user_id = ?1 AND team_role = 'player' AND active = 1`, [userId],
    );
    if (activeMembership) {
      throw new RecordValidationError('This player already belongs to an active team. Use Transfer player instead.');
    }
    await this.ensureNumberAvailable(teamId, number, userId);
    const now = new Date().toISOString();
    await this.database.batch([
      {
        sql: `INSERT INTO team_memberships
          (team_id, user_id, team_role, jersey_number, revision, active, created_at,
           updated_at, archived_at, archived_by, season_id)
         VALUES (?1, ?2, 'player', ?3, 1, 1, ?4, ?4, NULL, NULL, ?5)
         ON CONFLICT(team_id, user_id) DO UPDATE SET
           team_role = 'player', jersey_number = excluded.jersey_number,
           revision = team_memberships.revision + 1, active = 1,
           updated_at = excluded.updated_at, archived_at = NULL, archived_by = NULL,
           season_id = excluded.season_id`,
        params: [teamId, userId, number, now, season.id],
      },
      {
        sql: `INSERT INTO season_memberships
          (season_id, team_id, user_id, team_role, display_name_snapshot,
           jersey_number_snapshot, status, joined_at, removed_at, removed_by)
         VALUES (?1, ?2, ?3, 'player', ?4, ?5, 'active', ?6, NULL, NULL)
         ON CONFLICT(season_id, user_id) DO UPDATE SET
           status = 'active', removed_at = NULL, removed_by = NULL,
           display_name_snapshot = excluded.display_name_snapshot,
           jersey_number_snapshot = excluded.jersey_number_snapshot`,
        params: [season.id, teamId, userId, player.display_name, number, now],
      },
      {
        sql: `UPDATE users SET active = 1, archived_at = NULL, archived_by = NULL,
                revision = revision + 1, updated_at = ?2 WHERE id = ?1`,
        params: [userId, now],
      },
      { sql: 'DELETE FROM sessions WHERE user_id = ?1', params: [userId] },
    ]);
    const member = await this.getMember(teamId, userId, true);
    await writeAudit(this.database, actorUserId, 'add_existing', 'membership', `${teamId}:${userId}`, null, member);
    return member!;
  }

  async transferPlayer(
    userIdValue: string,
    destinationTeamId: string,
    numberValue: unknown,
    actorUserId: string,
  ): Promise<TeamMemberRecord> {
    const userId = validateId(userIdValue, 'Player ID');
    const number = validateNumber(numberValue);
    const { season } = await this.activeSeasonFor(destinationTeamId);
    const player = await this.database.one<{ id: string; display_name: string; role: string }>(
      'SELECT id, display_name, role FROM users WHERE id = ?1', [userId],
    );
    if (!player || player.role !== 'player') throw new RecordNotFoundError('Player account not found.');
    const source = await this.database.one<{ team_id: string; season_id: string | null }>(
      `SELECT team_id, season_id FROM team_memberships
        WHERE user_id = ?1 AND team_role = 'player' AND active = 1`, [userId],
    );
    if (!source) return this.addExistingPlayer(destinationTeamId, { userId, number }, actorUserId);
    if (source.team_id === destinationTeamId) {
      throw new RecordValidationError('The player already belongs to the destination team.');
    }
    await this.ensureNumberAvailable(destinationTeamId, number, userId);
    const now = new Date().toISOString();
    await this.database.batch([
      {
        sql: `UPDATE team_memberships SET active = 0, revision = revision + 1,
                updated_at = ?3, archived_at = ?3, archived_by = ?4
               WHERE team_id = ?1 AND user_id = ?2 AND active = 1`,
        params: [source.team_id, userId, now, actorUserId],
      },
      {
        sql: `UPDATE season_memberships SET status = 'removed', removed_at = ?3,
                removed_by = ?4
               WHERE season_id = ?1 AND user_id = ?2
                 AND EXISTS (SELECT 1 FROM team_seasons ts
                              WHERE ts.id = ?1 AND ts.status = 'active')`,
        params: [source.season_id, userId, now, actorUserId],
      },
      {
        sql: `UPDATE assignment_recipients SET withdrawn_at = ?3, lock_active = 0,
                released_at = COALESCE(released_at, ?3)
               WHERE player_id = ?2 AND assignment_id IN (
                 SELECT id FROM practice_assignments
                  WHERE team_id = ?1 AND status = 'active'
                    AND closed_at IS NULL AND cancelled_at IS NULL
               ) AND withdrawn_at IS NULL`,
        params: [source.team_id, userId, now],
      },
      {
        sql: `UPDATE attempts SET outcome = 'abandoned', lifecycle_status = 'abandoned',
                abandon_reason = 'transferred_team', completed_at = COALESCE(completed_at, ?3),
                updated_at = ?3
               WHERE team_id = ?1 AND player_id = ?2 AND lifecycle_status = 'incomplete'`,
        params: [source.team_id, userId, now],
      },
      {
        sql: `INSERT INTO team_memberships
          (team_id, user_id, team_role, jersey_number, revision, active, created_at,
           updated_at, archived_at, archived_by, season_id)
         VALUES (?1, ?2, 'player', ?3, 1, 1, ?4, ?4, NULL, NULL, ?5)
         ON CONFLICT(team_id, user_id) DO UPDATE SET
           team_role = 'player', jersey_number = excluded.jersey_number,
           revision = team_memberships.revision + 1, active = 1,
           updated_at = excluded.updated_at, archived_at = NULL, archived_by = NULL,
           season_id = excluded.season_id`,
        params: [destinationTeamId, userId, number, now, season.id],
      },
      {
        sql: `INSERT INTO season_memberships
          (season_id, team_id, user_id, team_role, display_name_snapshot,
           jersey_number_snapshot, status, joined_at, removed_at, removed_by)
         VALUES (?1, ?2, ?3, 'player', ?4, ?5, 'active', ?6, NULL, NULL)
         ON CONFLICT(season_id, user_id) DO UPDATE SET status = 'active',
           removed_at = NULL, removed_by = NULL,
           display_name_snapshot = excluded.display_name_snapshot,
           jersey_number_snapshot = excluded.jersey_number_snapshot`,
        params: [season.id, destinationTeamId, userId, player.display_name, number, now],
      },
      {
        sql: `UPDATE users SET active = 1, archived_at = NULL, archived_by = NULL,
                revision = revision + 1, updated_at = ?2 WHERE id = ?1`,
        params: [userId, now],
      },
      { sql: 'DELETE FROM sessions WHERE user_id = ?1', params: [userId] },
    ]);
    const member = await this.getMember(destinationTeamId, userId, true);
    await writeAudit(this.database, actorUserId, 'transfer', 'player', userId,
      { teamId: source.team_id, seasonId: source.season_id },
      { teamId: destinationTeamId, seasonId: season.id, number });
    return member!;
  }

  async advanceRoster(
    sourceTeamId: string,
    input: AdvanceRosterInput,
    actorUserId: string,
  ): Promise<{ team: TeamOption; seasonId: string; movedUserIds: string[] }> {
    const sourceTeam = await this.get(sourceTeamId, true);
    if (!sourceTeam) throw new RecordNotFoundError('Source team not found.');
    if (await new SqliteSeasonRepository(this.database).active(sourceTeamId)) {
      throw new RecordValidationError('Close the source team season before advancing its roster.');
    }
    const requested = Array.isArray(input.members) ? input.members : [];
    if (!requested.length) throw new RecordValidationError('Select at least one player or coach to advance.');
    const requestedIds = new Set(requested.map((member) => validateId(member.userId, 'Member ID')));
    if (requestedIds.size !== requested.length) throw new RecordValidationError('Each roster member can be selected only once.');
    const sourceMembers = sourceTeam.roster.filter(
      (member) => member.active !== false && requestedIds.has(member.playerId),
    );
    if (sourceMembers.length !== requestedIds.size) {
      throw new RecordValidationError('One or more selected accounts no longer belong to the source team.');
    }

    const now = new Date().toISOString();
    let destinationTeamId = String(input.destinationTeamId || '').trim();
    let destinationSeasonId = '';
    const commands: Array<{ sql: string; params?: unknown[] }> = [];
    let destinationTeam: TeamOption | null = null;
    if (destinationTeamId) {
      destinationTeamId = validateId(destinationTeamId, 'Destination team ID');
      if (destinationTeamId === sourceTeamId) {
        throw new RecordValidationError('Choose a different destination team.');
      }
      const destination = await this.activeSeasonFor(destinationTeamId);
      destinationTeam = destination.team;
      destinationSeasonId = destination.season.id;
    } else {
      const name = validateName(input.destinationTeamName, 'Destination team name');
      await this.ensureTeamNameAvailable(name);
      const seasonName = validateName(input.seasonName, 'Destination season name');
      const startsOn = validateDate(input.startsOn, 'Start date');
      const endsOn = validateDate(input.endsOn, 'End date');
      if (startsOn && endsOn && endsOn < startsOn) {
        throw new RecordValidationError('End date cannot be earlier than the start date.');
      }
      destinationTeamId = `team-${crypto.randomUUID()}`;
      destinationSeasonId = crypto.randomUUID();
      commands.push(
        {
          sql: `INSERT INTO teams
            (id, name, revision, active, created_at, updated_at)
           VALUES (?1, ?2, 1, 1, ?3, ?3)`,
          params: [destinationTeamId, name, now],
        },
        {
          sql: `INSERT INTO team_seasons
            (id, team_id, name, status, starts_on, ends_on, created_by, created_at, updated_at)
           VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?7, ?7)`,
          params: [destinationSeasonId, destinationTeamId, seasonName, startsOn, endsOn, actorUserId, now],
        },
      );
    }

    const existingNumbers = new Set(
      (destinationTeam?.roster || [])
        .filter((member) => member.role === 'player' && member.active !== false)
        .map((member) => member.number),
    );
    for (const member of sourceMembers) {
      const requestedMember = requested.find((item) => item.userId === member.playerId)!;
      const number = member.role === 'player'
        ? validateNumber(requestedMember.number ?? member.number)
        : '';
      if (member.role === 'player' && existingNumbers.has(number)) {
        throw new RecordValidationError(`Player number ${number} is already active on the destination team.`);
      }
      if (member.role === 'player') existingNumbers.add(number);
      commands.push(
        {
          sql: `UPDATE team_memberships SET active = 0, revision = revision + 1,
                  updated_at = ?3, archived_at = ?3, archived_by = ?4
                 WHERE team_id = ?1 AND user_id = ?2 AND active = 1`,
          params: [sourceTeamId, member.playerId, now, actorUserId],
        },
        {
          sql: `UPDATE assignment_recipients SET withdrawn_at = ?3, lock_active = 0,
                  released_at = COALESCE(released_at, ?3)
                 WHERE player_id = ?2 AND assignment_id IN (
                   SELECT id FROM practice_assignments
                    WHERE team_id = ?1 AND status = 'active'
                      AND closed_at IS NULL AND cancelled_at IS NULL
                 ) AND withdrawn_at IS NULL`,
          params: [sourceTeamId, member.playerId, now],
        },
        {
          sql: `UPDATE attempts SET outcome = 'abandoned', lifecycle_status = 'abandoned',
                  abandon_reason = 'advanced_roster', completed_at = COALESCE(completed_at, ?3),
                  updated_at = ?3
                 WHERE team_id = ?1 AND player_id = ?2 AND lifecycle_status = 'incomplete'`,
          params: [sourceTeamId, member.playerId, now],
        },
        {
          sql: `INSERT INTO team_memberships
            (team_id, user_id, team_role, jersey_number, revision, active, created_at,
             updated_at, archived_at, archived_by, season_id)
           VALUES (?1, ?2, ?3, ?4, 1, 1, ?5, ?5, NULL, NULL, ?6)
           ON CONFLICT(team_id, user_id) DO UPDATE SET
             team_role = excluded.team_role, jersey_number = excluded.jersey_number,
             revision = team_memberships.revision + 1, active = 1,
             updated_at = excluded.updated_at, archived_at = NULL, archived_by = NULL,
             season_id = excluded.season_id`,
          params: [destinationTeamId, member.playerId, member.role, number, now, destinationSeasonId],
        },
        {
          sql: `INSERT INTO season_memberships
            (season_id, team_id, user_id, team_role, display_name_snapshot,
             jersey_number_snapshot, status, joined_at, removed_at, removed_by)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7, NULL, NULL)
           ON CONFLICT(season_id, user_id) DO UPDATE SET status = 'active',
             removed_at = NULL, removed_by = NULL,
             display_name_snapshot = excluded.display_name_snapshot,
             jersey_number_snapshot = excluded.jersey_number_snapshot`,
          params: [destinationSeasonId, destinationTeamId, member.playerId, member.role,
            member.name, number, now],
        },
        {
          sql: `UPDATE users SET active = 1, archived_at = NULL, archived_by = NULL,
                  revision = revision + 1, updated_at = ?2 WHERE id = ?1`,
          params: [member.playerId, now],
        },
        { sql: 'DELETE FROM sessions WHERE user_id = ?1', params: [member.playerId] },
      );
    }
    await this.database.batch(commands);
    const team = await this.get(destinationTeamId, true);
    await writeAudit(this.database, actorUserId, 'advance_roster', 'team', destinationTeamId,
      { sourceTeamId },
      { destinationTeamId, destinationSeasonId, movedUserIds: [...requestedIds] });
    return { team: team!, seasonId: destinationSeasonId, movedUserIds: [...requestedIds] };
  }

  async getMember(teamId: string, userId: string, includeArchived = false): Promise<TeamMemberRecord | null> {
    const row = await this.database.one<MemberRow>(
      `SELECT tm.team_id, tm.user_id, u.display_name, u.role,
              tm.jersey_number, tm.revision AS membership_revision,
              u.revision AS user_revision,
              tm.season_id,
              CASE WHEN tm.active = 1 AND u.active = 1 THEN 1 ELSE 0 END AS active
         FROM team_memberships tm JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ?1 AND tm.user_id = ?2
          ${includeArchived ? '' : 'AND tm.active = 1 AND u.active = 1'}`,
      [teamId, userId],
    );
    return row ? mapTeam({
      id: teamId, name: '', revision: 1, active: 1, archived_at: null,
      active_season_id: null, active_season_name: null,
    }, [row]).roster[0] : null;
  }

  async updateMember(teamId: string, userId: string, input: Partial<MemberInput>, expectedRevision: number, actorUserId: string): Promise<TeamMemberRecord> {
    const before = await this.getMember(teamId, userId, true);
    if (!before) throw new RecordNotFoundError('Team member not found.');
    const name = validateName(input.name ?? before.name, before.role === 'coach' ? 'Coach name' : 'Player name');
    const number = before.role === 'player'
      ? validateNumber(input.number ?? before.number)
      : '';
    if (before.role === 'player') await this.ensureNumberAvailable(teamId, number, userId);
    const now = new Date().toISOString();
    const membership = await this.database.execute(
      `UPDATE team_memberships SET jersey_number = ?3, revision = revision + 1, updated_at = ?4
        WHERE team_id = ?1 AND user_id = ?2 AND revision = ?5`,
      [teamId, userId, number, now, expectedRevision],
    );
    if (!membership.changes) throw new RevisionConflictError();
    await this.database.execute(
      `UPDATE users SET display_name = ?2, revision = revision + 1, updated_at = ?3
        WHERE id = ?1`,
      [userId, name, now],
    );
    await this.database.execute(
      `UPDATE season_memberships
          SET display_name_snapshot = ?3, jersey_number_snapshot = ?4
        WHERE season_id = ?1 AND user_id = ?2`,
      [before.seasonId, userId, name, number],
    );
    if (input.password) await this.resetPassword(userId, input.password, actorUserId, false);
    const updated = await this.getMember(teamId, userId, true);
    await writeAudit(this.database, actorUserId, 'update', 'membership', `${teamId}:${userId}`, before, updated);
    return updated!;
  }

  async setMemberActive(teamId: string, userId: string, active: boolean, expectedRevision: number, actorUserId: string): Promise<TeamMemberRecord> {
    const before = await this.getMember(teamId, userId, true);
    if (!before) throw new RecordNotFoundError('Team member not found.');
    const now = new Date().toISOString();
    const season = active
      ? await new SqliteSeasonRepository(this.database).active(teamId)
      : null;
    if (active && !season) {
      throw new RecordValidationError('Create an active season before restoring this account to the team.');
    }
    if (active && before.role === 'player') {
      const otherActive = await this.database.one<{ team_id: string }>(
        `SELECT team_id FROM team_memberships
          WHERE user_id = ?1 AND team_role = 'player' AND active = 1 AND team_id <> ?2`,
        [userId, teamId],
      );
      if (otherActive) {
        throw new RecordValidationError('This player already belongs to another active team. Transfer them instead.');
      }
      await this.ensureNumberAvailable(teamId, before.number, userId);
    }
    const result = await this.database.execute(
      `UPDATE team_memberships SET active = ?3, revision = revision + 1, updated_at = ?4,
                                   archived_at = ?5, archived_by = ?6,
                                   season_id = CASE WHEN ?3 = 1 THEN ?8 ELSE season_id END
        WHERE team_id = ?1 AND user_id = ?2 AND revision = ?7`,
      [teamId, userId, active ? 1 : 0, now, active ? null : now,
        active ? null : actorUserId, expectedRevision, season?.id || before.seasonId],
    );
    if (!result.changes) throw new RevisionConflictError();
    if (active) {
      await this.database.execute(
        `UPDATE users SET active = 1, archived_at = NULL, archived_by = NULL,
                          revision = revision + 1, updated_at = ?2 WHERE id = ?1`,
        [userId, now],
      );
      await this.database.execute(
        `INSERT INTO season_memberships
          (season_id, team_id, user_id, team_role, display_name_snapshot,
           jersey_number_snapshot, status, joined_at, removed_at, removed_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7, NULL, NULL)
         ON CONFLICT(season_id, user_id) DO UPDATE SET
           status = 'active', removed_at = NULL, removed_by = NULL,
           display_name_snapshot = excluded.display_name_snapshot,
           jersey_number_snapshot = excluded.jersey_number_snapshot`,
        [season!.id, teamId, userId, before.role, before.name, before.number, now],
      );
    } else {
      await this.database.batch([
        {
          sql: `UPDATE season_memberships SET status = 'removed', removed_at = ?3,
                  removed_by = ?4 WHERE season_id = ?1 AND user_id = ?2`,
          params: [before.seasonId, userId, now, actorUserId],
        },
        {
          sql: `UPDATE assignment_recipients SET withdrawn_at = ?3, lock_active = 0,
                  released_at = COALESCE(released_at, ?3)
                 WHERE player_id = ?2 AND assignment_id IN (
                   SELECT id FROM practice_assignments
                    WHERE season_id = ?1 AND status = 'active'
                      AND closed_at IS NULL AND cancelled_at IS NULL
                 ) AND withdrawn_at IS NULL`,
          params: [before.seasonId, userId, now],
        },
        {
          sql: `UPDATE attempts SET outcome = 'abandoned', lifecycle_status = 'abandoned',
                  abandon_reason = 'removed_from_team', completed_at = COALESCE(completed_at, ?3),
                  updated_at = ?3
                 WHERE season_id = ?1 AND player_id = ?2 AND lifecycle_status = 'incomplete'`,
          params: [before.seasonId, userId, now],
        },
      ]);
      await this.database.execute(
        `UPDATE users SET active = 0, archived_at = ?2, archived_by = ?3,
                          revision = revision + 1, updated_at = ?2
          WHERE id = ?1 AND NOT EXISTS (
            SELECT 1 FROM team_memberships
             WHERE user_id = ?1 AND active = 1
          )`,
        [userId, now, actorUserId],
      );
      await this.database.execute('DELETE FROM sessions WHERE user_id = ?1', [userId]);
    }
    const updated = await this.getMember(teamId, userId, true);
    await writeAudit(this.database, actorUserId, active ? 'restore' : 'remove_from_team', 'membership', `${teamId}:${userId}`, before, updated);
    return updated!;
  }

  async resetPassword(
    userId: string,
    passwordValue: unknown,
    actorUserId: string,
    audit = true,
    temporary = true,
  ): Promise<void> {
    const password = validatePassword(passwordValue, true);
    const existing = await this.database.one<{ id: string }>('SELECT id FROM users WHERE id = ?1', [userId]);
    if (!existing) throw new RecordNotFoundError('User not found.');
    const credentials = await createPasswordHash(password);
    await this.database.execute(
      `UPDATE users SET password_hash = ?2, password_salt = ?3,
                        password_iterations = ?4, must_change_password = ?5,
                        failed_login_attempts = 0, locked_until = NULL,
                        password_changed_at = ?6, revision = revision + 1,
                        updated_at = ?6
        WHERE id = ?1`,
      [
        userId,
        credentials.hash,
        credentials.salt,
        credentials.iterations,
        temporary ? 1 : 0,
        new Date().toISOString(),
      ],
    );
    await this.database.execute('DELETE FROM sessions WHERE user_id = ?1', [userId]);
    if (audit) await writeAudit(this.database, actorUserId, 'password_reset', 'user', userId, null, { reset: true, temporary });
  }
}
