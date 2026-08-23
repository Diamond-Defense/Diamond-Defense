import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';

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
}

interface CoachAttemptRow extends AttemptRow {
  id: string;
  player_id: string;
}

export type AttemptOutcome = 'passed' | 'failed' | 'abandoned';

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
  phase: 1 | 2;
  formatVersion?: 2;
  runId?: string;
  outcome?: AttemptOutcome;
  startedAt?: string;
  completedAt?: string;
  abandonReason?: string | null;
  situationRevision?: number | null;
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
  const conditions = ['a.team_id = ?1'];
  const add = (condition: (placeholder: string) => string, value: unknown) => {
    params.push(value);
    conditions.push(condition(`?${params.length}`));
  };
  if (filters.playerId) add((placeholder) => `a.player_id = ${placeholder}`, filters.playerId);
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
  };
}

export class SqliteAttemptRepository {
  constructor(private readonly database: SqliteDatabaseAdapter) {}

  async save(
    playerId: string,
    teamId: string,
    attempt: AttemptInput,
  ): Promise<{ id: string; created: boolean }> {
    const id = crypto.randomUUID();
    const runId = String(attempt.runId || '').trim() || id;
    const completedAt = attempt.completedAt || attempt.ts || new Date().toISOString();
    const startedAt = attempt.startedAt || completedAt;
    const outcome: AttemptOutcome = attempt.outcome
      ?? (attempt.success === true ? 'passed' : 'failed');
    const payload = {
      ...attempt,
      formatVersion: attempt.formatVersion ?? 2,
      runId,
      outcome,
      startedAt,
      completedAt,
      playerId,
      ts: completedAt,
    };
    const result = await this.database.execute(
      `INSERT OR IGNORE INTO attempts
        (id, player_id, team_id, situation_key, phase, stage, score, total,
         success, tries_used, elapsed_seconds, payload_json, created_at, run_id,
         outcome, started_at, completed_at, abandon_reason, situation_revision,
         situation_title, team_name, player_name, player_number)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
         ?14, ?15, ?16, ?17, ?18,
         (SELECT revision FROM situations WHERE key = ?4),
         COALESCE((SELECT title FROM situations WHERE key = ?4), ''),
         COALESCE((SELECT name FROM teams WHERE id = ?3), ''),
         COALESCE((SELECT display_name FROM users WHERE id = ?2), ''),
         COALESCE((SELECT jersey_number FROM team_memberships
                    WHERE team_id = ?3 AND user_id = ?2), ''))`,
      [
        id,
        playerId,
        teamId,
        attempt.situationKey,
        attempt.phase,
        attempt.stage ?? null,
        attempt.score ?? null,
        attempt.total ?? null,
        outcome === 'abandoned' ? 0 : outcome === 'passed' ? 1 : 0,
        attempt.triesUsed ?? 0,
        attempt.timeElapsed ?? 0,
        JSON.stringify(payload),
        completedAt,
        runId,
        outcome,
        startedAt,
        completedAt,
        attempt.abandonReason || null,
      ],
    );
    return { id, created: result.changes > 0 };
  }

  async listForPlayer(playerId: string): Promise<AttemptInput[]> {
    const rows = await this.database.all<AttemptRow>(
      `SELECT payload_json, run_id, outcome, started_at, completed_at,
              abandon_reason, situation_revision, situation_title, team_name,
              player_name, player_number, created_at
         FROM attempts
        WHERE player_id = ?1 ORDER BY created_at`,
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
              a.created_at
         FROM attempts a
        WHERE a.team_id = ?1
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
                a.player_name, a.player_number,
                ROW_NUMBER() OVER (
                  PARTITION BY a.player_id
                  ORDER BY a.created_at DESC, a.id DESC
                ) AS player_rank
           FROM attempts a
          WHERE ${where.clause}
       )
       SELECT id, player_id, payload_json, created_at, run_id, outcome,
              started_at, completed_at, abandon_reason, situation_revision,
              situation_title, team_name, player_name, player_number
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
              a.player_name, a.player_number
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
              a.player_name, a.player_number
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
