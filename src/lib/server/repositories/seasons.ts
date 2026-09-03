import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';
import { writeAudit } from './audit';
import { RecordNotFoundError, RecordValidationError } from './errors';

export type SeasonStatus = 'active' | 'closed' | 'archived';

interface SeasonRow {
  id: string;
  team_id: string;
  name: string;
  status: SeasonStatus;
  starts_on: string | null;
  ends_on: string | null;
  closed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  member_count: number;
  assignment_count: number;
  attempt_count: number;
}

export interface TeamSeason {
  id: string;
  teamId: string;
  name: string;
  status: SeasonStatus;
  startsOn: string | null;
  endsOn: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  assignmentCount: number;
  attemptCount: number;
}

export interface SeasonInput {
  name: string;
  startsOn?: string | null;
  endsOn?: string | null;
}

export interface SeasonMember {
  seasonId: string;
  userId: string;
  role: 'player' | 'coach';
  name: string;
  number: string;
  status: 'active' | 'removed';
}

export interface CleanupPreview {
  seasonId: string;
  playerId: string | null;
  memberships: number;
  assignments: number;
  recipients: number;
  progressRecords: number;
  attempts: number;
}

export interface SeasonDeletionPreview extends CleanupPreview {
  seasonName: string;
}

export interface SeasonExport {
  season: TeamSeason;
  members: Array<{
    playerId: string;
    role: 'player' | 'coach';
    name: string;
    number: string;
    status: 'active' | 'removed';
    joinedAt: string;
    removedAt: string | null;
  }>;
  attempts: Array<{
    runId: string;
    completedAt: string;
    playerId: string;
    playerName: string;
    playerNumber: string;
    situationKey: string;
    situationTitle: string;
    outcome: string;
    score: number | null;
    total: number | null;
    triesUsed: number;
    elapsedSeconds: number;
    assignmentId: string | null;
  }>;
}

function validDate(value: unknown, label: string): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new RecordValidationError(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new RecordValidationError(`${label} is invalid.`);
  }
  return text;
}

function normalizedInput(input: SeasonInput): Required<SeasonInput> {
  const name = String(input.name || '').trim();
  if (!name || name.length > 120) {
    throw new RecordValidationError('Season name is required and must be 120 characters or fewer.');
  }
  const startsOn = validDate(input.startsOn, 'Season start date');
  const endsOn = validDate(input.endsOn, 'Season end date');
  if (startsOn && endsOn && startsOn > endsOn) {
    throw new RecordValidationError('The season end date must not be before its start date.');
  }
  return { name, startsOn, endsOn };
}

function mapSeason(row: SeasonRow): TeamSeason {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    status: row.status,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    closedAt: row.closed_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    memberCount: Number(row.member_count || 0),
    assignmentCount: Number(row.assignment_count || 0),
    attemptCount: Number(row.attempt_count || 0),
  };
}

export class SqliteSeasonRepository {
  constructor(private readonly database: SqliteDatabaseAdapter) {}

  async list(teamId: string): Promise<TeamSeason[]> {
    const rows = await this.database.all<SeasonRow>(
      `SELECT ts.id, ts.team_id, ts.name, ts.status, ts.starts_on, ts.ends_on,
              ts.closed_at, ts.archived_at, ts.created_at, ts.updated_at,
              (SELECT COUNT(*) FROM season_memberships sm
                WHERE sm.season_id = ts.id) AS member_count,
              (SELECT COUNT(*) FROM practice_assignments pa
                WHERE pa.season_id = ts.id) AS assignment_count,
              (SELECT COUNT(*) FROM attempts a
                WHERE a.season_id = ts.id) AS attempt_count
         FROM team_seasons ts
        WHERE ts.team_id = ?1
        ORDER BY CASE ts.status WHEN 'active' THEN 0 WHEN 'closed' THEN 1 ELSE 2 END,
                 ts.starts_on DESC, ts.created_at DESC`,
      [teamId],
    );
    return rows.map(mapSeason);
  }

  async get(teamId: string, seasonId: string): Promise<TeamSeason | null> {
    return (await this.list(teamId)).find((season) => season.id === seasonId) || null;
  }

  async active(teamId: string): Promise<TeamSeason | null> {
    return (await this.list(teamId)).find((season) => season.status === 'active') || null;
  }

  async listMembers(teamId: string): Promise<SeasonMember[]> {
    const rows = await this.database.all<{
      season_id: string;
      user_id: string;
      team_role: 'player' | 'coach';
      display_name_snapshot: string;
      jersey_number_snapshot: string;
      status: 'active' | 'removed';
    }>(
      `SELECT season_id, user_id, team_role, display_name_snapshot,
              jersey_number_snapshot, status
         FROM season_memberships
        WHERE team_id = ?1
        ORDER BY season_id, team_role, CAST(jersey_number_snapshot AS INTEGER),
                 display_name_snapshot`,
      [teamId],
    );
    return rows.map((row) => ({
      seasonId: row.season_id,
      userId: row.user_id,
      role: row.team_role,
      name: row.display_name_snapshot,
      number: row.jersey_number_snapshot,
      status: row.status,
    }));
  }

  async create(teamId: string, input: SeasonInput, actorUserId: string): Promise<TeamSeason> {
    const team = await this.database.one<{ id: string; active: number }>(
      'SELECT id, active FROM teams WHERE id = ?1',
      [teamId],
    );
    if (!team) throw new RecordNotFoundError('Team not found.');
    if (!team.active) throw new RecordValidationError('Restore the team before creating a season.');
    if (await this.active(teamId)) {
      throw new RecordValidationError('Close the current season before creating another one.');
    }
    const normalized = normalizedInput(input);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const members = await this.database.all<{
      user_id: string;
      team_role: 'player' | 'coach';
      display_name: string;
      jersey_number: string;
    }>(
      `SELECT tm.user_id, tm.team_role, u.display_name, tm.jersey_number
         FROM team_memberships tm JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ?1 AND tm.active = 1 AND u.active = 1`,
      [teamId],
    );
    await this.database.batch([
      {
        sql: `INSERT INTO team_seasons
          (id, team_id, name, status, starts_on, ends_on, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?7, ?7)`,
        params: [id, teamId, normalized.name, normalized.startsOn, normalized.endsOn, actorUserId, now],
      },
      {
        sql: `UPDATE team_memberships SET season_id = ?2, updated_at = ?3
               WHERE team_id = ?1 AND active = 1`,
        params: [teamId, id, now],
      },
      ...members.map((member) => ({
        sql: `INSERT INTO season_memberships
          (season_id, team_id, user_id, team_role, display_name_snapshot,
           jersey_number_snapshot, status, joined_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7)`,
        params: [id, teamId, member.user_id, member.team_role, member.display_name,
          member.jersey_number, now],
      })),
    ]);
    const created = await this.get(teamId, id);
    await writeAudit(this.database, actorUserId, 'create', 'team_season', id, null, created);
    return created!;
  }

  async close(teamId: string, seasonId: string, actorUserId: string): Promise<TeamSeason> {
    const before = await this.get(teamId, seasonId);
    if (!before) throw new RecordNotFoundError('Season not found.');
    if (before.status !== 'active') throw new RecordValidationError('Only the active season can be closed.');
    const now = new Date().toISOString();
    await this.database.batch([
      {
        sql: `UPDATE team_seasons SET status = 'closed', closed_at = ?3,
                updated_at = ?3 WHERE id = ?1 AND team_id = ?2 AND status = 'active'`,
        params: [seasonId, teamId, now],
      },
      {
        sql: `UPDATE practice_assignments SET closed_at = COALESCE(closed_at, ?2),
                ended_by = COALESCE(ended_by, ?3), updated_at = ?2
               WHERE season_id = ?1 AND status = 'active' AND closed_at IS NULL
                 AND cancelled_at IS NULL`,
        params: [seasonId, now, actorUserId],
      },
      {
        sql: `UPDATE attempts SET outcome = 'abandoned', lifecycle_status = 'abandoned',
                abandon_reason = 'season_closed', completed_at = COALESCE(completed_at, ?2),
                updated_at = ?2
               WHERE season_id = ?1 AND lifecycle_status = 'incomplete'`,
        params: [seasonId, now],
      },
      {
        sql: `UPDATE assignment_recipients SET lock_active = 0,
                released_at = COALESCE(released_at, ?2)
               WHERE assignment_id IN (
                 SELECT id FROM practice_assignments WHERE season_id = ?1
               )`,
        params: [seasonId, now],
      },
      {
        sql: `DELETE FROM sessions WHERE user_id IN (
               SELECT user_id FROM team_memberships
                WHERE team_id = ?1 AND season_id = ?2 AND active = 1
             )`,
        params: [teamId, seasonId],
      },
    ]);
    const updated = await this.get(teamId, seasonId);
    await writeAudit(this.database, actorUserId, 'close', 'team_season', seasonId, before, updated);
    return updated!;
  }

  async archive(teamId: string, seasonId: string, actorUserId: string): Promise<TeamSeason> {
    const before = await this.get(teamId, seasonId);
    if (!before) throw new RecordNotFoundError('Season not found.');
    if (before.status !== 'closed') {
      throw new RecordValidationError('Close the season before archiving it.');
    }
    const now = new Date().toISOString();
    await this.database.batch([
      {
        sql: `UPDATE team_seasons SET status = 'archived', archived_at = ?3,
                updated_at = ?3 WHERE id = ?1 AND team_id = ?2 AND status = 'closed'`,
        params: [seasonId, teamId, now],
      },
      {
        sql: `UPDATE practice_assignments SET archived_from_status = status,
                status = 'archived', archived_at = ?2, updated_at = ?2
               WHERE season_id = ?1 AND status <> 'archived'`,
        params: [seasonId, now],
      },
    ]);
    const updated = await this.get(teamId, seasonId);
    await writeAudit(this.database, actorUserId, 'archive', 'team_season', seasonId, before, updated);
    return updated!;
  }

  async deleteClosedSeason(
    teamId: string,
    seasonId: string,
    actorUserId: string,
  ): Promise<SeasonDeletionPreview> {
    const season = await this.get(teamId, seasonId);
    if (!season) throw new RecordNotFoundError('Season not found.');
    if (season.status === 'active') {
      throw new RecordValidationError('Close the season before deleting it.');
    }
    const counts = await this.cleanupPreview(teamId, seasonId);
    const preview: SeasonDeletionPreview = { ...counts, seasonName: season.name };
    await this.database.batch([
      {
        sql: `UPDATE team_memberships SET season_id = NULL, updated_at = ?3
               WHERE team_id = ?1 AND season_id = ?2`,
        params: [teamId, seasonId, new Date().toISOString()],
      },
      { sql: 'DELETE FROM attempts WHERE team_id = ?1 AND season_id = ?2', params: [teamId, seasonId] },
      { sql: 'DELETE FROM practice_assignments WHERE team_id = ?1 AND season_id = ?2', params: [teamId, seasonId] },
      { sql: 'DELETE FROM season_memberships WHERE team_id = ?1 AND season_id = ?2', params: [teamId, seasonId] },
      { sql: 'DELETE FROM team_seasons WHERE team_id = ?1 AND id = ?2', params: [teamId, seasonId] },
    ]);
    await writeAudit(
      this.database,
      actorUserId,
      'delete',
      'team_season',
      seasonId,
      { name: season.name, counts },
      null,
    );
    return preview;
  }

  async cleanupPreview(teamId: string, seasonId: string, playerId?: string): Promise<CleanupPreview> {
    if (!(await this.get(teamId, seasonId))) throw new RecordNotFoundError('Season not found.');
    const player = String(playerId || '').trim();
    const params = player ? [seasonId, player] : [seasonId];
    const [memberships, assignments, recipients, progress, attempts] = await Promise.all([
      this.database.one<{ total: number }>(
        `SELECT COUNT(*) AS total FROM season_memberships
          WHERE season_id = ?1${player ? ' AND user_id = ?2' : ''}`,
        params,
      ),
      this.database.one<{ total: number }>(
        `SELECT COUNT(*) AS total FROM practice_assignments pa WHERE pa.season_id = ?1
          ${player ? `AND EXISTS (
            SELECT 1 FROM assignment_recipients ar
             WHERE ar.assignment_id = pa.id AND ar.player_id = ?2
          )` : ''}`,
        params,
      ),
      this.database.one<{ total: number }>(
        `SELECT COUNT(*) AS total FROM assignment_recipients
          WHERE assignment_id IN (SELECT id FROM practice_assignments WHERE season_id = ?1)
          ${player ? 'AND player_id = ?2' : ''}`,
        params,
      ),
      this.database.one<{ total: number }>(
        `SELECT COUNT(*) AS total FROM assignment_progress
          WHERE assignment_id IN (SELECT id FROM practice_assignments WHERE season_id = ?1)
          ${player ? 'AND player_id = ?2' : ''}`,
        params,
      ),
      this.database.one<{ total: number }>(
        `SELECT COUNT(*) AS total FROM attempts
          WHERE season_id = ?1${player ? ' AND player_id = ?2' : ''}`,
        params,
      ),
    ]);
    return {
      seasonId,
      playerId: player || null,
      memberships: Number(memberships?.total || 0),
      assignments: Number(assignments?.total || 0),
      recipients: Number(recipients?.total || 0),
      progressRecords: Number(progress?.total || 0),
      attempts: Number(attempts?.total || 0),
    };
  }

  async exportSeason(teamId: string, seasonId: string): Promise<SeasonExport> {
    const season = await this.get(teamId, seasonId);
    if (!season) throw new RecordNotFoundError('Season not found.');
    const members = await this.database.all<{
      user_id: string;
      team_role: 'player' | 'coach';
      display_name_snapshot: string;
      jersey_number_snapshot: string;
      status: 'active' | 'removed';
      joined_at: string;
      removed_at: string | null;
    }>(
      `SELECT user_id, team_role, display_name_snapshot, jersey_number_snapshot,
              status, joined_at, removed_at
         FROM season_memberships WHERE season_id = ?1
        ORDER BY team_role, CAST(jersey_number_snapshot AS INTEGER), display_name_snapshot`,
      [seasonId],
    );
    const attempts = await this.database.all<{
      run_id: string;
      completed_at: string | null;
      created_at: string;
      player_id: string;
      player_name: string;
      player_number: string;
      situation_key: string;
      situation_title: string;
      outcome: string | null;
      score: number | null;
      total: number | null;
      tries_used: number;
      elapsed_seconds: number;
      assignment_id: string | null;
    }>(
      `SELECT run_id, completed_at, created_at, player_id, player_name, player_number,
              situation_key, situation_title, outcome, score, total, tries_used,
              elapsed_seconds, assignment_id
         FROM attempts WHERE team_id = ?1 AND season_id = ?2
        ORDER BY created_at, id`,
      [teamId, seasonId],
    );
    return {
      season,
      members: members.map((member) => ({
        playerId: member.user_id,
        role: member.team_role,
        name: member.display_name_snapshot,
        number: member.jersey_number_snapshot,
        status: member.status,
        joinedAt: member.joined_at,
        removedAt: member.removed_at,
      })),
      attempts: attempts.map((attempt) => ({
        runId: attempt.run_id,
        completedAt: attempt.completed_at || attempt.created_at,
        playerId: attempt.player_id,
        playerName: attempt.player_name,
        playerNumber: attempt.player_number,
        situationKey: attempt.situation_key,
        situationTitle: attempt.situation_title,
        outcome: attempt.outcome || 'incomplete',
        score: attempt.score,
        total: attempt.total,
        triesUsed: Number(attempt.tries_used || 0),
        elapsedSeconds: Number(attempt.elapsed_seconds || 0),
        assignmentId: attempt.assignment_id,
      })),
    };
  }

  async clearPlayerRecords(
    teamId: string,
    seasonId: string,
    playerId: string,
    actorUserId: string,
  ): Promise<CleanupPreview> {
    const season = await this.get(teamId, seasonId);
    if (!season) throw new RecordNotFoundError('Season not found.');
    if (season.status === 'active') {
      throw new RecordValidationError('Close the season before clearing player records.');
    }
    const preview = await this.cleanupPreview(teamId, seasonId, playerId);
    if (!preview.memberships && !preview.recipients && !preview.attempts) {
      throw new RecordNotFoundError('No records were found for this player and season.');
    }
    await this.database.batch([
      {
        sql: `DELETE FROM attempts WHERE team_id = ?1 AND season_id = ?2 AND player_id = ?3`,
        params: [teamId, seasonId, playerId],
      },
      {
        sql: `DELETE FROM assignment_recipients
               WHERE player_id = ?2 AND assignment_id IN (
                 SELECT id FROM practice_assignments WHERE season_id = ?1
               )`,
        params: [seasonId, playerId],
      },
      {
        sql: `DELETE FROM season_memberships
               WHERE season_id = ?1 AND team_id = ?2 AND user_id = ?3`,
        params: [seasonId, teamId, playerId],
      },
    ]);
    await writeAudit(
      this.database,
      actorUserId,
      'clear_player_records',
      'team_season',
      seasonId,
      null,
      { counts: preview },
    );
    return preview;
  }

  async deletePlayerPermanently(playerId: string, actorUserId: string): Promise<Record<string, number>> {
    const player = await this.database.one<{ id: string; role: string }>(
      'SELECT id, role FROM users WHERE id = ?1',
      [playerId],
    );
    if (!player) throw new RecordNotFoundError('Player account not found.');
    if (player.role !== 'player') {
      throw new RecordValidationError('Only player accounts can be permanently deleted here.');
    }
    const counts = {
      memberships: Number((await this.database.one<{ total: number }>(
        'SELECT COUNT(*) AS total FROM team_memberships WHERE user_id = ?1', [playerId],
      ))?.total || 0),
      seasonMemberships: Number((await this.database.one<{ total: number }>(
        'SELECT COUNT(*) AS total FROM season_memberships WHERE user_id = ?1', [playerId],
      ))?.total || 0),
      attempts: Number((await this.database.one<{ total: number }>(
        'SELECT COUNT(*) AS total FROM attempts WHERE player_id = ?1', [playerId],
      ))?.total || 0),
      assignments: Number((await this.database.one<{ total: number }>(
        'SELECT COUNT(*) AS total FROM assignment_recipients WHERE player_id = ?1', [playerId],
      ))?.total || 0),
      sessions: Number((await this.database.one<{ total: number }>(
        'SELECT COUNT(*) AS total FROM sessions WHERE user_id = ?1', [playerId],
      ))?.total || 0),
    };
    const now = new Date().toISOString();
    const auditPattern = `%${playerId}%`;
    await this.database.batch([
      { sql: 'DELETE FROM sessions WHERE user_id = ?1', params: [playerId] },
      {
        sql: `DELETE FROM audit_log
               WHERE actor_user_id = ?1 OR entity_id = ?1 OR entity_id LIKE ?2
                  OR before_json LIKE ?3 OR after_json LIKE ?3`,
        params: [playerId, `%:${playerId}`, auditPattern],
      },
      { sql: 'DELETE FROM users WHERE id = ?1 AND role = \'player\'', params: [playerId] },
      {
        sql: `INSERT INTO deletion_audit
          (id, action, actor_role, affected_counts_json, created_at)
         VALUES (?1, 'permanent_player_deletion', 'admin', ?2, ?3)`,
        params: [crypto.randomUUID(), JSON.stringify(counts), now],
      },
    ]);
    return counts;
  }
}
