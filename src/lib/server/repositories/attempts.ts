import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';
import { RecordValidationError } from './errors';

interface AttemptRow {
  payload_json: string;
  run_id: string | null;
  outcome: AttemptOutcome | null;
  started_at: string | null;
  completed_at: string | null;
  abandon_reason: string | null;
  situation_revision: number | null;
  situation_title: string;
  team_name: string;
  player_name: string;
  player_number: string;
  created_at: string;
  lifecycle_status: AttemptLifecycleStatus;
  assignment_id: string | null;
  season_id: string | null;
}

interface CoachAttemptRow extends AttemptRow {
  id: string;
  player_id: string;
}

export type AttemptOutcome = 'passed' | 'failed' | 'abandoned';
export type AttemptLifecycleStatus = 'incomplete' | 'completed' | 'abandoned';

export interface PhaseOneCheck {
  checkedAt: string;
  scoreCorrect: number;
  scoreTotal: number;
  triesUsed: number;
  remainingTries: number;
  positions: Record<string, { x: number; y: number }>;
}

export interface PhaseOneResult {
  ok: boolean;
  scoreCorrect: number;
  scoreTotal: number;
  triesUsed: number;
  elapsed: number | null;
  completedAt: string;
}

export interface SequenceCheck {
  checkedAt: string;
  stage: number;
  picked: string[];
  expected: string[];
  success: boolean;
  triesUsed: number;
}

export interface SequenceStageResult {
  stage: number;
  success: boolean;
  triesUsed: number;
  timeElapsed: number | null;
  picked: string[];
  expected: string[];
  completedAt: string;
}

export interface AttemptInput {
  situationKey: string;
  assignmentId?: string;
  seasonId?: string;
  phase: 1 | 2;
  formatVersion?: 2;
  runId?: string;
  outcome?: AttemptOutcome;
  startedAt?: string;
  completedAt?: string;
  abandonReason?: string | null;
  situationRevision?: number | null;
  lifecycleStatus?: AttemptLifecycleStatus;
  phase1?: PhaseOneResult | null;
  phase1Checks?: PhaseOneCheck[];
  sequenceChecks?: SequenceCheck[];
  sequenceStages?: SequenceStageResult[];
  stage?: number;
  score?: number;
  total?: number;
  success?: boolean;
  triesUsed?: number;
  timeElapsed?: number;
  ts?: string;
  [key: string]: unknown;
}

export interface CoachAttempt extends AttemptInput {
  id: string;
  playerId: string;
  playerName: string;
  playerNumber: string;
  createdAt: string;
}

export interface PaginatedCoachAttempts {
  attempts: CoachAttempt[];
  total: number;
}

export interface AttemptReportFilters {
  playerId?: string;
  seasonId?: string;
  situationKey?: string;
  outcome?: AttemptOutcome;
  dateFrom?: string;
  dateTo?: string;
}

export interface AttemptReportSummary {
  attempts: number;
  players: number;
  passed: number;
  failed: number;
  abandoned: number;
  passRate: number | null;
  averageScorePercent: number | null;
  averageCompletionSeconds: number | null;
}

function reportWhere(teamId: string, filters: AttemptReportFilters = {}): {
  clause: string;
  params: unknown[];
} {
  const params: unknown[] = [teamId];
  const conditions = ["a.team_id = ?1", "a.lifecycle_status <> 'incomplete'"];
  const add = (condition: (placeholder: string) => string, value: unknown) => {
    params.push(value);
    conditions.push(condition(`?${params.length}`));
  };
  if (filters.playerId) add((placeholder) => `a.player_id = ${placeholder}`, filters.playerId);
  if (filters.seasonId) add((placeholder) => `a.season_id = ${placeholder}`, filters.seasonId);
  if (filters.situationKey) add((placeholder) => `a.situation_key = ${placeholder}`, filters.situationKey);
  if (filters.outcome) add((placeholder) => `a.outcome = ${placeholder}`, filters.outcome);
  if (filters.dateFrom) {
    add(
      (placeholder) => `substr(COALESCE(a.completed_at, a.created_at), 1, 10) >= ${placeholder}`,
      filters.dateFrom,
    );
  }
  if (filters.dateTo) {
    add(
      (placeholder) => `substr(COALESCE(a.completed_at, a.created_at), 1, 10) <= ${placeholder}`,
      filters.dateTo,
    );
  }
  return { clause: conditions.join(' AND '), params };
}

function mapCoachAttempt(row: CoachAttemptRow): CoachAttempt {
  return {
    ...(JSON.parse(row.payload_json) as AttemptInput),
    id: row.id,
    runId: row.run_id ?? undefined,
    outcome: row.outcome ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    abandonReason: row.abandon_reason,
    situationRevision: row.situation_revision,
    situationTitle: row.situation_title,
    teamName: row.team_name,
    playerId: row.player_id,
    playerName: row.player_name,
    playerNumber: row.player_number,
    createdAt: row.created_at,
    lifecycleStatus: row.lifecycle_status,
    assignmentId: row.assignment_id ?? undefined,
    seasonId: row.season_id ?? undefined,
  };
}

function mapAttempt(row: AttemptRow): AttemptInput {
  return {
    ...(JSON.parse(row.payload_json) as AttemptInput),
    runId: row.run_id ?? undefined,
    outcome: row.outcome ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    abandonReason: row.abandon_reason,
    situationRevision: row.situation_revision,
    situationTitle: row.situation_title,
    teamName: row.team_name,
    playerName: row.player_name,
    playerNumber: row.player_number,
    createdAt: row.created_at,
    lifecycleStatus: row.lifecycle_status,
    assignmentId: row.assignment_id ?? undefined,
    seasonId: row.season_id ?? undefined,
  };
}

export class SqliteAttemptRepository {
  constructor(private readonly database: SqliteDatabaseAdapter) {}

  async save(
    playerId: string,
    teamId: string,
    attempt: AttemptInput,
  ): Promise<{
    id: string;
    created: boolean;
    changed: boolean;
    lifecycleStatus: AttemptLifecycleStatus;
  }> {
    const id = crypto.randomUUID();
    const runId = String(attempt.runId || '').trim() || id;
    const now = new Date().toISOString();
    const outcome: AttemptOutcome | null = attempt.outcome
      ?? (typeof attempt.success === 'boolean' ? (attempt.success ? 'passed' : 'failed') : null);
    const lifecycleStatus: AttemptLifecycleStatus = outcome == null
      ? 'incomplete'
      : outcome === 'abandoned' ? 'abandoned' : 'completed';
    const completedAt = lifecycleStatus === 'incomplete'
      ? null
      : attempt.completedAt || attempt.ts || now;
    const startedAt = attempt.startedAt || completedAt || now;

    const assignedSituation = attempt.assignmentId
      ? await this.database.one<{
          revision: number;
          title: string;
        }>(
          `SELECT ast.situation_revision AS revision, sv.title
             FROM assignment_situations ast
             JOIN situation_versions sv
               ON sv.situation_key = ast.situation_key
              AND sv.revision = ast.situation_revision
            WHERE ast.assignment_id = ?1 AND ast.situation_key = ?2`,
          [attempt.assignmentId, attempt.situationKey],
        )
      : null;
    const currentSituation = assignedSituation || await this.database.one<{
      revision: number;
      title: string;
    }>('SELECT revision, title FROM situations WHERE key = ?1', [attempt.situationKey]);
    if (!currentSituation) throw new RecordValidationError('Situation not found.');
    const situationRevision = Number(currentSituation.revision);
    if (
      attempt.situationRevision != null
      && Number(attempt.situationRevision) !== situationRevision
    ) {
      throw new RecordValidationError('This attempt uses a different situation revision. Reload and try again.');
    }
    const identity = await this.database.one<{
      team_name: string;
      player_name: string;
      player_number: string;
      season_id: string | null;
    }>(
      `SELECT COALESCE(t.name, '') AS team_name,
              COALESCE(u.display_name, '') AS player_name,
              COALESCE(tm.jersey_number, '') AS player_number,
              CASE WHEN ?3 IS NOT NULL THEN
                (SELECT season_id FROM practice_assignments WHERE id = ?3)
              ELSE tm.season_id END AS season_id
         FROM users u
         LEFT JOIN teams t ON t.id = ?2
         LEFT JOIN team_memberships tm ON tm.team_id = ?2 AND tm.user_id = u.id
        WHERE u.id = ?1`,
      [playerId, teamId, attempt.assignmentId || null],
    );
    if (!identity?.season_id) {
      throw new RecordValidationError('This attempt is not associated with a team season.');
    }
    const payload = {
      ...attempt,
      formatVersion: attempt.formatVersion ?? 2,
      runId,
      ...(outcome ? { outcome } : {}),
      startedAt,
      ...(completedAt ? { completedAt } : {}),
      playerId,
      situationRevision,
      lifecycleStatus,
      seasonId: identity.season_id,
      ts: completedAt || startedAt,
    };

    const existing = await this.database.one<{
      id: string;
      player_id: string;
      team_id: string;
      situation_key: string;
      assignment_id: string | null;
      lifecycle_status: AttemptLifecycleStatus;
    }>(
      `SELECT id, player_id, team_id, situation_key, assignment_id, lifecycle_status
         FROM attempts WHERE run_id = ?1`,
      [runId],
    );
    if (existing) {
      if (
        existing.player_id !== playerId
        || existing.team_id !== teamId
        || existing.situation_key !== attempt.situationKey
        || (existing.assignment_id || null) !== (attempt.assignmentId || null)
      ) {
        throw new RecordValidationError('The attempt identifier is already in use. Start the situation again.');
      }
      if (existing.lifecycle_status !== 'incomplete' || lifecycleStatus === 'incomplete') {
        return {
          id: existing.id,
          created: false,
          changed: false,
          lifecycleStatus: existing.lifecycle_status,
        };
      }
      await this.database.execute(
        `UPDATE attempts
            SET phase = ?2, stage = ?3, score = ?4, total = ?5,
                success = ?6, tries_used = ?7, elapsed_seconds = ?8,
                payload_json = ?9, outcome = ?10, completed_at = ?11,
                abandon_reason = ?12, lifecycle_status = ?13, updated_at = ?14
          WHERE id = ?1 AND lifecycle_status = 'incomplete'`,
        [
          existing.id,
          attempt.phase,
          attempt.stage ?? null,
          attempt.score ?? null,
          attempt.total ?? null,
          outcome === 'abandoned' ? 0 : outcome === 'passed' ? 1 : 0,
          attempt.triesUsed ?? 0,
          attempt.timeElapsed ?? 0,
          JSON.stringify(payload),
          outcome,
          completedAt,
          attempt.abandonReason || null,
          lifecycleStatus,
          now,
        ],
      );
      return { id: existing.id, created: false, changed: true, lifecycleStatus };
    }

    const result = await this.database.execute(
      `INSERT OR IGNORE INTO attempts
        (id, player_id, team_id, situation_key, phase, stage, score, total,
         success, tries_used, elapsed_seconds, payload_json, created_at, run_id,
         outcome, started_at, completed_at, abandon_reason, situation_revision,
         situation_title, team_name, player_name, player_number, assignment_id,
         lifecycle_status, updated_at, season_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
         ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27)`,
      [
        id,
        playerId,
        teamId,
        attempt.situationKey,
        attempt.phase,
        attempt.stage ?? null,
        attempt.score ?? null,
        attempt.total ?? null,
        lifecycleStatus === 'incomplete' ? null : outcome === 'abandoned' ? 0 : outcome === 'passed' ? 1 : 0,
        attempt.triesUsed ?? 0,
        attempt.timeElapsed ?? 0,
        JSON.stringify(payload),
        startedAt,
        runId,
        outcome,
        startedAt,
        completedAt,
        attempt.abandonReason || null,
        situationRevision,
        currentSituation.title,
        identity?.team_name || '',
        identity?.player_name || '',
        identity?.player_number || '',
        attempt.assignmentId || null,
        lifecycleStatus,
        now,
        identity.season_id,
      ],
    );
    if (result.changes > 0) return { id, created: true, changed: true, lifecycleStatus };
    const raced = await this.database.one<{ id: string; lifecycle_status: AttemptLifecycleStatus }>(
      'SELECT id, lifecycle_status FROM attempts WHERE run_id = ?1',
      [runId],
    );
    return {
      id: raced?.id || id,
      created: false,
      changed: false,
      lifecycleStatus: raced?.lifecycle_status || lifecycleStatus,
    };
  }

  async listForPlayer(playerId: string): Promise<AttemptInput[]> {
    const rows = await this.database.all<AttemptRow>(
      `SELECT payload_json, run_id, outcome, started_at, completed_at,
              abandon_reason, situation_revision, situation_title, team_name,
              player_name, player_number, created_at, lifecycle_status, assignment_id,
              season_id
         FROM attempts
        WHERE player_id = ?1 AND lifecycle_status <> 'incomplete' ORDER BY created_at`,
      [playerId],
    );
    return rows.map(mapAttempt);
  }

  async listForTeam(teamId: string): Promise<Array<AttemptInput & {
    playerName: string;
    playerNumber: string;
  }>> {
    const rows = await this.database.all<AttemptRow & {
      player_name: string;
      player_number: string;
    }>(
      `SELECT a.payload_json, a.run_id, a.outcome, a.started_at,
              a.completed_at, a.abandon_reason, a.situation_revision,
              a.situation_title, a.team_name, a.player_name, a.player_number,
              a.created_at, a.lifecycle_status, a.assignment_id, a.season_id
         FROM attempts a
        WHERE a.team_id = ?1 AND a.lifecycle_status <> 'incomplete'
        ORDER BY a.created_at DESC`,
      [teamId],
    );
    return rows.map((row) => ({
      ...mapAttempt(row),
      playerName: row.player_name,
      playerNumber: row.player_number,
    }));
  }

  async listLatestPerPlayer(
    teamId: string,
    limit: number,
    offset: number,
    filters: AttemptReportFilters = {},
  ): Promise<PaginatedCoachAttempts> {
    const where = reportWhere(teamId, filters);
    const count = await this.database.one<{ total: number }>(
      `SELECT COUNT(DISTINCT a.player_id) AS total FROM attempts a WHERE ${where.clause}`,
      where.params,
    );
    const limitPlaceholder = `?${where.params.length + 1}`;
    const offsetPlaceholder = `?${where.params.length + 2}`;
    const rows = await this.database.all<CoachAttemptRow>(
      `WITH ranked AS (
         SELECT a.id, a.player_id, a.payload_json, a.created_at, a.run_id,
                a.outcome, a.started_at, a.completed_at, a.abandon_reason,
                a.situation_revision, a.situation_title, a.team_name,
                a.player_name, a.player_number, a.lifecycle_status, a.assignment_id,
                a.season_id,
                ROW_NUMBER() OVER (
                  PARTITION BY a.player_id
                  ORDER BY a.created_at DESC, a.id DESC
                ) AS player_rank
           FROM attempts a
          WHERE ${where.clause}
       )
       SELECT id, player_id, payload_json, created_at, run_id, outcome,
              started_at, completed_at, abandon_reason, situation_revision,
              situation_title, team_name, player_name, player_number,
              lifecycle_status, assignment_id, season_id
         FROM ranked
        WHERE player_rank = 1
        ORDER BY created_at DESC, id DESC
        LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      [...where.params, limit, offset],
    );
    return {
      attempts: rows.map(mapCoachAttempt),
      total: Number(count?.total || 0),
    };
  }

  async listForTeamPlayer(
    teamId: string,
    playerId: string,
    limit: number,
    offset: number,
    filters: AttemptReportFilters = {},
  ): Promise<PaginatedCoachAttempts> {
    const where = reportWhere(teamId, { ...filters, playerId });
    const count = await this.database.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM attempts a WHERE ${where.clause}`,
      where.params,
    );
    const limitPlaceholder = `?${where.params.length + 1}`;
    const offsetPlaceholder = `?${where.params.length + 2}`;
    const rows = await this.database.all<CoachAttemptRow>(
      `SELECT a.id, a.player_id, a.payload_json, a.created_at, a.run_id,
              a.outcome, a.started_at, a.completed_at, a.abandon_reason,
              a.situation_revision, a.situation_title, a.team_name,
              a.player_name, a.player_number, a.lifecycle_status, a.assignment_id,
              a.season_id
         FROM attempts a
        WHERE ${where.clause}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      [...where.params, limit, offset],
    );
    return {
      attempts: rows.map(mapCoachAttempt),
      total: Number(count?.total || 0),
    };
  }

  async listFilteredForTeam(
    teamId: string,
    filters: AttemptReportFilters = {},
    limit?: number,
  ): Promise<CoachAttempt[]> {
    const where = reportWhere(teamId, filters);
    const limitClause = limit == null ? '' : `LIMIT ?${where.params.length + 1}`;
    const rows = await this.database.all<CoachAttemptRow>(
      `SELECT a.id, a.player_id, a.payload_json, a.created_at, a.run_id,
              a.outcome, a.started_at, a.completed_at, a.abandon_reason,
              a.situation_revision, a.situation_title, a.team_name,
              a.player_name, a.player_number, a.lifecycle_status, a.assignment_id,
              a.season_id
        FROM attempts a
        WHERE ${where.clause}
        ORDER BY a.created_at DESC, a.id DESC
        ${limitClause}`,
      limit == null ? where.params : [...where.params, limit],
    );
    return rows.map(mapCoachAttempt);
  }

  async summarizeForTeam(
    teamId: string,
    filters: AttemptReportFilters = {},
  ): Promise<AttemptReportSummary> {
    const where = reportWhere(teamId, filters);
    const row = await this.database.one<{
      attempts: number;
      players: number;
      passed: number;
      failed: number;
      abandoned: number;
      average_score_percent: number | null;
      average_completion_seconds: number | null;
    }>(
      `SELECT COUNT(*) AS attempts,
              COUNT(DISTINCT a.player_id) AS players,
              SUM(CASE WHEN a.outcome = 'passed' THEN 1 ELSE 0 END) AS passed,
              SUM(CASE WHEN a.outcome = 'failed' THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN a.outcome = 'abandoned' THEN 1 ELSE 0 END) AS abandoned,
              AVG(CASE WHEN a.total > 0 THEN (a.score * 100.0) / a.total END)
                AS average_score_percent,
              AVG(CASE
                WHEN a.started_at IS NOT NULL AND a.completed_at IS NOT NULL
                  THEN MAX(0, (julianday(a.completed_at) - julianday(a.started_at)) * 86400.0)
                ELSE a.elapsed_seconds
              END) AS average_completion_seconds
         FROM attempts a
        WHERE ${where.clause}`,
      where.params,
    );
    const attempts = Number(row?.attempts || 0);
    const passed = Number(row?.passed || 0);
    return {
      attempts,
      players: Number(row?.players || 0),
      passed,
      failed: Number(row?.failed || 0),
      abandoned: Number(row?.abandoned || 0),
      passRate: attempts ? (passed / attempts) * 100 : null,
      averageScorePercent: row?.average_score_percent == null
        ? null : Number(row.average_score_percent),
      averageCompletionSeconds: row?.average_completion_seconds == null
        ? null : Number(row.average_completion_seconds),
    };
  }
}
