import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';
import {
  buildDevelopmentInsightsFromMetrics,
  type AttemptDevelopmentInsights,
} from '$lib/server/results/development';
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
  season_name: string | null;
  assignment_title: string | null;
  assignment_cycle_number: number | null;
  assignment_due_at: string | null;
  assignment_status: string | null;
  recipient_status: string | null;
  difficulty: string | null;
  primary_category: string | null;
  teaching_categories: string | null;
}

interface DevelopmentMetricRow {
  player_id: string;
  player_name: string;
  player_number: string;
  situation_key: string;
  situation_title: string;
  activity_at: string | null;
  passed: number;
  positioning_passed: number | null;
  sequence_passed: number | null;
  score_percent: number | null;
  completion_seconds: number | null;
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
  seasonName: string;
  activityType: 'assigned' | 'free_play';
  assignmentTitle: string | null;
  assignmentCycleNumber: number | null;
  assignmentDueAt: string | null;
  assignmentStatus: string | null;
  recipientStatus: string | null;
  difficulty: string;
  primaryCategory: string;
  teachingCategories: string[];
  isRetake: boolean;
  isOverdue: boolean;
  isLateCompletion: boolean;
}

export interface PaginatedCoachAttempts {
  attempts: CoachAttempt[];
  total: number;
}

export interface AttemptReportFilters {
  playerIds?: string[];
  playerId?: string;
  seasonId?: string;
  assignmentId?: string;
  situationKey?: string;
  outcome?: AttemptOutcome | 'incomplete';
  activityType?: 'assigned' | 'free_play';
  difficulty?: 'foundational' | 'intermediate' | 'advanced';
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AttemptReportSummary {
  attempts: number;
  players: number;
  passed: number;
  failed: number;
  abandoned: number;
  incomplete: number;
  assigned: number;
  freePlay: number;
  overdue: number;
  lateCompletions: number;
  retakes: number;
  passRate: number | null;
  averageScorePercent: number | null;
  averageCompletionSeconds: number | null;
}

export interface AttemptReportOptions {
  players: Array<{ id: string; name: string; number: string }>;
  seasons: Array<{ id: string; name: string; status: string }>;
  assignments: Array<{
    id: string;
    title: string;
    cycleNumber: number;
    status: string;
    seasonName: string;
  }>;
  situations: Array<{ key: string; displayCode: string; title: string }>;
  categories: Array<{ id: string; label: string }>;
}

const REPORT_JOINS = `
  LEFT JOIN practice_assignments pa ON pa.id = a.assignment_id
  LEFT JOIN assignment_recipients ar
    ON ar.assignment_id = a.assignment_id AND ar.player_id = a.player_id
  LEFT JOIN team_seasons ts ON ts.id = a.season_id
  LEFT JOIN situation_versions sv
    ON sv.situation_key = a.situation_key AND sv.revision = a.situation_revision
  LEFT JOIN situations s ON s.key = a.situation_key`;

const REPORT_SITUATION_JOINS = `
  LEFT JOIN situation_versions sv
    ON sv.situation_key = a.situation_key AND sv.revision = a.situation_revision
  LEFT JOIN situations s ON s.key = a.situation_key`;

function reportFilterJoins(filters: AttemptReportFilters): string {
  return filters.difficulty ? REPORT_SITUATION_JOINS : '';
}

const REPORT_SELECT = `
  a.id, a.player_id, a.payload_json, a.created_at, a.run_id,
  a.outcome, a.started_at, a.completed_at, a.abandon_reason,
  a.situation_revision, a.situation_title, a.team_name,
  a.player_name, a.player_number, a.lifecycle_status, a.assignment_id,
  a.season_id, ts.name AS season_name, pa.title AS assignment_title,
  pa.cycle_number AS assignment_cycle_number, pa.due_at AS assignment_due_at,
  pa.status AS assignment_status, ar.status AS recipient_status,
  COALESCE(sv.difficulty, s.difficulty_level, s.difficulty, '') AS difficulty,
  COALESCE(
    (SELECT tc.label
       FROM situation_version_teaching_categories svtc
       JOIN teaching_categories tc ON tc.id = svtc.category_id
      WHERE svtc.situation_key = a.situation_key
        AND svtc.situation_revision = a.situation_revision
        AND svtc.is_primary = 1
      LIMIT 1),
    (SELECT tc.label
       FROM situation_teaching_categories stc
       JOIN teaching_categories tc ON tc.id = stc.category_id
      WHERE stc.situation_key = a.situation_key AND stc.is_primary = 1
      LIMIT 1),
    ''
  ) AS primary_category,
  COALESCE(
    (SELECT group_concat(label, char(31)) FROM (
       SELECT tc.label AS label
         FROM situation_version_teaching_categories svtc
         JOIN teaching_categories tc ON tc.id = svtc.category_id
        WHERE svtc.situation_key = a.situation_key
          AND svtc.situation_revision = a.situation_revision
        ORDER BY svtc.is_primary DESC, svtc.sort_order, tc.label
    )),
    (SELECT group_concat(label, char(31)) FROM (
       SELECT tc.label AS label
         FROM situation_teaching_categories stc
         JOIN teaching_categories tc ON tc.id = stc.category_id
        WHERE stc.situation_key = a.situation_key
        ORDER BY stc.is_primary DESC, stc.sort_order, tc.label
    )),
    ''
  ) AS teaching_categories`;

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
  if(filters.playerIds?.length){
    const placeholders = filters.playerIds.map(id=>{params.push(id);return `?${params.length}`;});
    conditions.push(`a.player_id IN (${placeholders.join(',')})`);
  }
  if (filters.seasonId) add((placeholder) => `a.season_id = ${placeholder}`, filters.seasonId);
  if (filters.assignmentId) add((placeholder) => `a.assignment_id = ${placeholder}`, filters.assignmentId);
  if (filters.situationKey) add((placeholder) => `a.situation_key = ${placeholder}`, filters.situationKey);
  if (filters.outcome === 'incomplete') conditions.push("a.lifecycle_status = 'incomplete'");
  else if (filters.outcome) add((placeholder) => `a.outcome = ${placeholder}`, filters.outcome);
  if (filters.activityType === 'assigned') conditions.push('a.assignment_id IS NOT NULL');
  if (filters.activityType === 'free_play') conditions.push('a.assignment_id IS NULL');
  if (filters.difficulty) {
    add(
      (placeholder) => `COALESCE(sv.difficulty, s.difficulty_level, s.difficulty, '') = ${placeholder}`,
      filters.difficulty,
    );
  }
  if (filters.categoryId) {
    add(
      (placeholder) => `(
        EXISTS (
          SELECT 1 FROM situation_version_teaching_categories category_filter
           WHERE category_filter.situation_key = a.situation_key
             AND category_filter.situation_revision = a.situation_revision
             AND category_filter.category_id = ${placeholder}
        ) OR (
          NOT EXISTS (
            SELECT 1 FROM situation_version_teaching_categories version_categories
             WHERE version_categories.situation_key = a.situation_key
               AND version_categories.situation_revision = a.situation_revision
          ) AND EXISTS (
            SELECT 1 FROM situation_teaching_categories category_filter
             WHERE category_filter.situation_key = a.situation_key
               AND category_filter.category_id = ${placeholder}
          )
        )
      )`,
      filters.categoryId,
    );
  }
  if (filters.dateFrom) {
    add(
      (placeholder) => `COALESCE(a.completed_at, a.created_at) >= ${placeholder}`,
      `${filters.dateFrom}T00:00:00.000Z`,
    );
  }
  if (filters.dateTo) {
    const exclusiveDate = new Date(`${filters.dateTo}T00:00:00.000Z`);
    exclusiveDate.setUTCDate(exclusiveDate.getUTCDate() + 1);
    add(
      (placeholder) => `COALESCE(a.completed_at, a.created_at) < ${placeholder}`,
      exclusiveDate.toISOString(),
    );
  }
  return { clause: conditions.join(' AND '), params };
}

function mapCoachAttempt(row: CoachAttemptRow): CoachAttempt {
  const assignmentDueAt = row.assignment_due_at || null;
  const completedAt = row.completed_at || null;
  const lifecycleStatus = row.lifecycle_status;
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
    seasonName: row.season_name || '',
    activityType: row.assignment_id ? 'assigned' : 'free_play',
    assignmentTitle: row.assignment_title || null,
    assignmentCycleNumber: row.assignment_cycle_number == null
      ? null : Number(row.assignment_cycle_number),
    assignmentDueAt,
    assignmentStatus: row.assignment_status || null,
    recipientStatus: row.recipient_status || null,
    difficulty: row.difficulty || '',
    primaryCategory: row.primary_category || '',
    teachingCategories: String(row.teaching_categories || '').split(String.fromCharCode(31)).filter(Boolean),
    isRetake: Number(row.assignment_cycle_number || 0) > 1,
    isOverdue: Boolean(
      assignmentDueAt
      && lifecycleStatus === 'incomplete'
      && new Date(assignmentDueAt).getTime() < Date.now()
    ),
    isLateCompletion: Boolean(
      assignmentDueAt
      && completedAt
      && new Date(completedAt).getTime() > new Date(assignmentDueAt).getTime()
    ),
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
      `SELECT COUNT(DISTINCT a.player_id) AS total
         FROM attempts a ${reportFilterJoins(filters)}
        WHERE ${where.clause}`,
      where.params,
    );
    const limitPlaceholder = `?${where.params.length + 1}`;
    const offsetPlaceholder = `?${where.params.length + 2}`;
    const rows = await this.database.all<CoachAttemptRow>(
      `WITH ranked AS (
         SELECT ${REPORT_SELECT},
                ROW_NUMBER() OVER (
                  PARTITION BY a.player_id
                  ORDER BY a.created_at DESC, a.id DESC
                ) AS player_rank
           FROM attempts a ${REPORT_JOINS}
          WHERE ${where.clause}
       )
       SELECT id, player_id, payload_json, created_at, run_id, outcome,
              started_at, completed_at, abandon_reason, situation_revision,
              situation_title, team_name, player_name, player_number,
              lifecycle_status, assignment_id, season_id, season_name,
              assignment_title, assignment_cycle_number, assignment_due_at,
              assignment_status, recipient_status, difficulty, primary_category,
              teaching_categories
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
      `SELECT COUNT(*) AS total
         FROM attempts a ${reportFilterJoins({ ...filters, playerId })}
        WHERE ${where.clause}`,
      where.params,
    );
    const limitPlaceholder = `?${where.params.length + 1}`;
    const offsetPlaceholder = `?${where.params.length + 2}`;
    const rows = await this.database.all<CoachAttemptRow>(
      `SELECT ${REPORT_SELECT}
         FROM attempts a ${REPORT_JOINS}
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
      `SELECT ${REPORT_SELECT}
        FROM attempts a ${REPORT_JOINS}
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
      incomplete: number;
      assigned: number;
      free_play: number;
      overdue: number;
      late_completions: number;
      retakes: number;
      average_score_percent: number | null;
      average_completion_seconds: number | null;
    }>(
      `SELECT COUNT(*) AS attempts,
              COUNT(DISTINCT a.player_id) AS players,
              SUM(CASE WHEN a.outcome = 'passed' THEN 1 ELSE 0 END) AS passed,
              SUM(CASE WHEN a.outcome = 'failed' THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN a.outcome = 'abandoned' THEN 1 ELSE 0 END) AS abandoned,
              SUM(CASE WHEN a.lifecycle_status = 'incomplete' THEN 1 ELSE 0 END) AS incomplete,
              SUM(CASE WHEN a.assignment_id IS NOT NULL THEN 1 ELSE 0 END) AS assigned,
              SUM(CASE WHEN a.assignment_id IS NULL THEN 1 ELSE 0 END) AS free_play,
              SUM(CASE
                WHEN a.lifecycle_status = 'incomplete' AND pa.due_at IS NOT NULL
                  AND datetime(pa.due_at) < CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS overdue,
              SUM(CASE
                WHEN a.completed_at IS NOT NULL AND pa.due_at IS NOT NULL
                  AND datetime(a.completed_at) > datetime(pa.due_at) THEN 1 ELSE 0 END) AS late_completions,
              SUM(CASE WHEN COALESCE(pa.cycle_number, 0) > 1 THEN 1 ELSE 0 END) AS retakes,
              AVG(CASE WHEN a.total > 0 AND a.outcome IN ('passed', 'failed') THEN (a.score * 100.0) / a.total END)
                AS average_score_percent,
              AVG(CASE WHEN a.lifecycle_status <> 'incomplete' THEN
                CASE
                  WHEN a.started_at IS NOT NULL AND a.completed_at IS NOT NULL
                    THEN MAX(0, (julianday(a.completed_at) - julianday(a.started_at)) * 86400.0)
                  ELSE a.elapsed_seconds
                END
              END) AS average_completion_seconds
         FROM attempts a
         LEFT JOIN practice_assignments pa ON pa.id = a.assignment_id
         ${reportFilterJoins(filters)}
        WHERE ${where.clause}`,
      where.params,
    );
    const attempts = Number(row?.attempts || 0);
    const passed = Number(row?.passed || 0);
    const finalizedAttempts = passed + Number(row?.failed || 0);
    return {
      attempts,
      players: Number(row?.players || 0),
      passed,
      failed: Number(row?.failed || 0),
      abandoned: Number(row?.abandoned || 0),
      incomplete: Number(row?.incomplete || 0),
      assigned: Number(row?.assigned || 0),
      freePlay: Number(row?.free_play || 0),
      overdue: Number(row?.overdue || 0),
      lateCompletions: Number(row?.late_completions || 0),
      retakes: Number(row?.retakes || 0),
      passRate: finalizedAttempts ? (passed / finalizedAttempts) * 100 : null,
      averageScorePercent: row?.average_score_percent == null
        ? null : Number(row.average_score_percent),
      averageCompletionSeconds: row?.average_completion_seconds == null
        ? null : Number(row.average_completion_seconds),
    };
  }

  async developmentInsightsForTeam(
    teamId: string,
    filters: AttemptReportFilters = {},
  ): Promise<AttemptDevelopmentInsights> {
    const where = reportWhere(teamId, filters);
    const rows = await this.database.all<DevelopmentMetricRow>(
      `SELECT a.player_id, a.player_name, a.player_number,
              a.situation_key, a.situation_title,
              COALESCE(a.completed_at, a.started_at, a.created_at) AS activity_at,
              CASE WHEN a.outcome = 'passed'
                     OR (a.outcome IS NULL AND a.success = 1) THEN 1 ELSE 0 END AS passed,
              CASE
                WHEN json_type(a.payload_json, '$.phase1.ok') IN ('true', 'false')
                  THEN CAST(json_extract(a.payload_json, '$.phase1.ok') AS INTEGER)
                WHEN json_type(a.payload_json, '$.phase1Ok') IN ('true', 'false')
                  THEN CAST(json_extract(a.payload_json, '$.phase1Ok') AS INTEGER)
                WHEN a.phase = 1 AND a.total > 0 THEN CASE WHEN a.score >= a.total THEN 1 ELSE 0 END
                ELSE NULL
              END AS positioning_passed,
              CASE
                WHEN json_array_length(COALESCE(json_extract(a.payload_json, '$.sequenceStages'), '[]')) > 0
                  THEN CASE WHEN EXISTS (
                    SELECT 1 FROM json_each(json_extract(a.payload_json, '$.sequenceStages')) stage
                     WHERE COALESCE(CAST(json_extract(stage.value, '$.success') AS INTEGER), 0) = 0
                  ) THEN 0 ELSE 1 END
                WHEN json_type(a.payload_json, '$.sequenceSuccess') IN ('true', 'false')
                  THEN CAST(json_extract(a.payload_json, '$.sequenceSuccess') AS INTEGER)
                WHEN a.phase = 2 AND a.success IS NOT NULL THEN a.success
                ELSE NULL
              END AS sequence_passed,
              CASE WHEN COALESCE(
                CAST(json_extract(a.payload_json, '$.phase1.scoreTotal') AS REAL),
                CAST(json_extract(a.payload_json, '$.phase1ScoreTotal') AS REAL),
                CASE WHEN a.phase = 1 THEN CAST(a.total AS REAL) END
              ) > 0 THEN 100.0 * COALESCE(
                CAST(json_extract(a.payload_json, '$.phase1.scoreCorrect') AS REAL),
                CAST(json_extract(a.payload_json, '$.phase1ScoreCorrect') AS REAL),
                CASE WHEN a.phase = 1 THEN CAST(a.score AS REAL) END
              ) / COALESCE(
                CAST(json_extract(a.payload_json, '$.phase1.scoreTotal') AS REAL),
                CAST(json_extract(a.payload_json, '$.phase1ScoreTotal') AS REAL),
                CASE WHEN a.phase = 1 THEN CAST(a.total AS REAL) END
              ) ELSE NULL END AS score_percent,
              CASE
                WHEN json_extract(a.payload_json, '$.phase1.elapsed') IS NOT NULL
                  OR json_extract(a.payload_json, '$.phase1Elapsed') IS NOT NULL
                  OR json_array_length(COALESCE(json_extract(a.payload_json, '$.sequenceStages'), '[]')) > 0
                THEN COALESCE(
                  CAST(json_extract(a.payload_json, '$.phase1.elapsed') AS REAL),
                  CAST(json_extract(a.payload_json, '$.phase1Elapsed') AS REAL), 0
                ) + CASE
                  WHEN json_array_length(COALESCE(json_extract(a.payload_json, '$.sequenceStages'), '[]')) > 0
                    THEN COALESCE((
                      SELECT SUM(COALESCE(CAST(json_extract(stage.value, '$.timeElapsed') AS REAL), 0))
                        FROM json_each(json_extract(a.payload_json, '$.sequenceStages')) stage
                    ), 0)
                  WHEN a.phase = 2 THEN COALESCE(
                    CAST(json_extract(a.payload_json, '$.timeElapsed') AS REAL), a.elapsed_seconds, 0
                  )
                  ELSE 0 END
                WHEN json_extract(a.payload_json, '$.timeElapsed') IS NOT NULL
                  THEN MAX(0, CAST(json_extract(a.payload_json, '$.timeElapsed') AS REAL))
                WHEN a.elapsed_seconds IS NOT NULL THEN MAX(0, a.elapsed_seconds)
                WHEN a.started_at IS NOT NULL AND a.completed_at IS NOT NULL
                  THEN MAX(0, (julianday(a.completed_at) - julianday(a.started_at)) * 86400.0)
                ELSE NULL
              END AS completion_seconds
         FROM attempts a ${reportFilterJoins(filters)}
        WHERE ${where.clause} AND a.lifecycle_status <> 'incomplete' AND (a.outcome IS NULL OR a.outcome IN ('passed', 'failed'))
        ORDER BY COALESCE(a.completed_at, a.started_at, a.created_at), a.id`,
      where.params,
    );
    return buildDevelopmentInsightsFromMetrics(rows.map((row) => ({
      playerId: row.player_id,
      playerName: row.player_name,
      playerNumber: row.player_number,
      situationKey: row.situation_key,
      situationTitle: row.situation_title,
      activityAt: row.activity_at,
      passed: Boolean(row.passed),
      positioningPassed: row.positioning_passed == null ? null : Boolean(row.positioning_passed),
      sequencePassed: row.sequence_passed == null ? null : Boolean(row.sequence_passed),
      scorePercent: row.score_percent == null ? null : Number(row.score_percent),
      completionSeconds: row.completion_seconds == null ? null : Number(row.completion_seconds),
    })), filters);
  }

  async reportOptionsForTeam(teamId: string): Promise<AttemptReportOptions> {
    const [players, seasons, assignments, situations, categories] = await Promise.all([
      this.database.all<{ id: string; name: string; number: string }>(
        `SELECT tm.user_id AS id, u.display_name AS name, tm.jersey_number AS number
           FROM team_memberships tm
           JOIN users u ON u.id = tm.user_id
          WHERE tm.team_id = ?1 AND tm.team_role = 'player' AND tm.active = 1
          UNION ALL
         SELECT a.player_id AS id,
                MAX(COALESCE(NULLIF(a.player_name, ''), u.display_name, 'Player')) AS name,
                MAX(COALESCE(NULLIF(a.player_number, ''), '')) AS number
           FROM attempts a
           LEFT JOIN users u ON u.id = a.player_id
          WHERE a.team_id = ?1 AND NOT EXISTS (
            SELECT 1 FROM team_memberships current_member
             WHERE current_member.team_id = a.team_id
               AND current_member.user_id = a.player_id
               AND current_member.team_role = 'player'
               AND current_member.active = 1
          )
          GROUP BY a.player_id
          ORDER BY name, number, id`,
        [teamId],
      ),
      this.database.all<{ id: string; name: string; status: string }>(
        `SELECT id, name, status FROM team_seasons
          WHERE team_id = ?1 ORDER BY starts_on DESC, created_at DESC`,
        [teamId],
      ),
      this.database.all<{
        id: string;
        title: string;
        cycle_number: number;
        status: string;
        season_name: string;
      }>(
        `SELECT pa.id, pa.title, pa.cycle_number, pa.status,
                COALESCE(ts.name, '') AS season_name
           FROM practice_assignments pa
           LEFT JOIN team_seasons ts ON ts.id = pa.season_id
          WHERE pa.team_id = ?1 AND pa.status <> 'draft'
          ORDER BY pa.created_at DESC, pa.id DESC`,
        [teamId],
      ),
      this.database.all<{ key: string; display_code: string | null; title: string }>(
        `SELECT key, display_code, title
           FROM situations
          ORDER BY display_code, title, key`,
      ),
      this.database.all<{ id: string; label: string }>(
        `SELECT id, label FROM teaching_categories
          WHERE active = 1 ORDER BY sort_order, label`,
      ),
    ]);
    return {
      players,
      seasons,
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        title: assignment.title,
        cycleNumber: Number(assignment.cycle_number || 1),
        status: assignment.status,
        seasonName: assignment.season_name,
      })),
      situations: situations.map((situation) => ({
        key: situation.key,
        displayCode: situation.display_code || '',
        title: situation.title,
      })),
      categories,
    };
  }
}
