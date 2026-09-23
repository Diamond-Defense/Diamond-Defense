import type { Situation } from '$lib/domain/models';
import type { SituationPlayOutcome, SituationRunnerOutcome } from '$lib/domain/models';
import {
  normalizeDifficulty,
  normalizeTeachingCategories,
} from '$lib/domain/situation-metadata';
import { normalizeSituationOutcomes } from '$lib/domain/situation-outcomes';
import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';
import { writeAudit } from './audit';
import {
  RecordNotFoundError,
  RecordValidationError,
  RevisionConflictError,
} from './errors';

interface SituationRow {
  key: string;
  display_code: string | null;
  category: string;
  difficulty: string;
  difficulty_level: string;
  payload_json: string;
  revision: number;
  active: number;
  archived_at: string | null;
}

interface TeachingCategoryRow {
  situation_key: string;
  category_id: string;
  is_primary: number;
  sort_order: number;
}

interface PlayOutcomeRow {
  situation_key: string;
  play_result: SituationPlayOutcome['result'];
  batter_result: SituationPlayOutcome['batterResult'];
  outs_recorded: number;
  batter_out_type: SituationPlayOutcome['batterOutType'] | null;
  batter_out_order: number | null;
  review_status: SituationPlayOutcome['reviewStatus'];
}

interface RunnerOutcomeRow {
  situation_key: string;
  starting_base: SituationRunnerOutcome['startingBase'];
  runner_result: SituationRunnerOutcome['result'];
  out_type: SituationRunnerOutcome['outType'] | null;
  out_order: number | null;
  tagged_up: number;
}

export type SituationRecord = Situation & {
  revision: number;
  active?: boolean;
  archivedAt?: string | null;
};

function validateSituation(situation: Situation): Situation {
  const key = String(situation?.key || '').trim();
  const title = String(situation?.title || '').trim();
  const category = String(situation?.category || '').trim();
  let difficulty: Situation['difficulty'];
  let teachingCategories: ReturnType<typeof normalizeTeachingCategories>;
  try {
    difficulty = normalizeDifficulty(situation?.difficulty);
    teachingCategories = normalizeTeachingCategories(situation);
  } catch (error) {
    throw new RecordValidationError(error instanceof Error ? error.message : 'Situation metadata is invalid.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/.test(key)) {
    throw new RecordValidationError('Situation key must use 2–80 letters, numbers, hyphens, or underscores.');
  }
  if (!title || title.length > 120) {
    throw new RecordValidationError('Situation name is required and must be 120 characters or fewer.');
  }
  if (!category || category.length > 60) {
    throw new RecordValidationError('Situation category is required and must be 60 characters or fewer.');
  }
  let outcomes: ReturnType<typeof normalizeSituationOutcomes>;
  try {
    outcomes = normalizeSituationOutcomes(situation);
  } catch (error) {
    throw new RecordValidationError(error instanceof Error ? error.message : 'Situation outcomes are invalid.');
  }
  if (outcomes.playOutcome.reviewStatus === 'needs_review') {
    throw new RecordValidationError(
      'Confirm the play and runner outcomes before publishing this situation.',
    );
  }
  const { displayCode: _clientDisplayCode, ...editableSituation } = situation;
  return { ...editableSituation, key, title, category, difficulty, ...teachingCategories, ...outcomes } as Situation;
}

function mapRow(
  row: SituationRow,
  categories: TeachingCategoryRow[],
  playOutcomes: PlayOutcomeRow[],
  runnerOutcomes: RunnerOutcomeRow[],
): SituationRecord {
  const assigned = categories
    .filter((category) => category.situation_key === row.key)
    .sort((left, right) => left.sort_order - right.sort_order);
  const raw = JSON.parse(row.payload_json) as Situation;
  const play = playOutcomes.find((outcome) => outcome.situation_key === row.key);
  const runners = runnerOutcomes
    .filter((runner) => runner.situation_key === row.key)
    .map((runner) => ({
      startingBase: runner.starting_base,
      result: runner.runner_result,
      ...(runner.out_type ? { outType: runner.out_type } : {}),
      ...(runner.out_order == null ? {} : { outOrder: Number(runner.out_order) as 1 | 2 | 3 }),
      taggedUp: runner.tagged_up === 1,
    }));
  const relational = play ? {
    playOutcome: {
      result: play.play_result,
      batterResult: play.batter_result,
      outsRecorded: Number(play.outs_recorded) as 0 | 1 | 2 | 3,
      ...(play.batter_out_type ? { batterOutType: play.batter_out_type } : {}),
      ...(play.batter_out_order == null ? {} : { batterOutOrder: Number(play.batter_out_order) as 1 | 2 | 3 }),
      reviewStatus: play.review_status,
    },
    runnerOutcomes: runners,
  } : {};
  const outcomes = normalizeSituationOutcomes({ ...raw, ...relational });
  return {
    ...raw,
    ...outcomes,
    displayCode: row.display_code || undefined,
    category: row.category,
    difficulty: row.difficulty_level as Situation['difficulty'],
    primaryCategory: assigned.find((category) => category.is_primary === 1)?.category_id as Situation['primaryCategory'],
    relatedCategories: assigned.filter((category) => category.is_primary === 0).map((category) => category.category_id) as Situation['relatedCategories'],
    revision: Number(row.revision),
    active: Boolean(row.active),
    archivedAt: row.archived_at,
  };
}

export class SqliteSituationRepository {
  constructor(private readonly database: SqliteDatabaseAdapter) {}

  private async categories(): Promise<TeachingCategoryRow[]> {
    return this.database.all<TeachingCategoryRow>(
      `SELECT situation_key, category_id, is_primary, sort_order
         FROM situation_teaching_categories ORDER BY situation_key, is_primary DESC, sort_order`,
    );
  }

  private async playOutcomes(): Promise<PlayOutcomeRow[]> {
    return this.database.all<PlayOutcomeRow>(
      `SELECT situation_key, play_result, batter_result, outs_recorded,
              batter_out_type, batter_out_order, review_status
         FROM situation_play_outcomes ORDER BY situation_key`,
    );
  }

  private async runnerOutcomes(): Promise<RunnerOutcomeRow[]> {
    return this.database.all<RunnerOutcomeRow>(
      `SELECT situation_key, starting_base, runner_result, out_type, out_order, tagged_up
         FROM situation_runner_outcomes
        ORDER BY situation_key,
          CASE starting_base WHEN 'first' THEN 1 WHEN 'second' THEN 2 ELSE 3 END`,
    );
  }

  private categoryCommands(situation: Situation, revision: number, payload: string, replaceCurrent = false) {
    const categories = [situation.primaryCategory, ...situation.relatedCategories];
    return [
      ...(replaceCurrent ? [{
        sql: `DELETE FROM situation_teaching_categories
               WHERE situation_key = ?1
                 AND EXISTS (SELECT 1 FROM situations WHERE key = ?1 AND revision = ?2 AND payload_json = ?3)`,
        params: [situation.key, revision, payload],
      }] : []),
      ...categories.map((categoryId, index) => ({
        sql: `INSERT INTO situation_teaching_categories
          (situation_key, category_id, is_primary, sort_order)
         SELECT ?1, ?3, ?4, ?5
          WHERE EXISTS (SELECT 1 FROM situations WHERE key = ?1 AND revision = ?2 AND payload_json = ?6)`,
        params: [situation.key, revision, categoryId, index === 0 ? 1 : 0, index, payload],
      })),
      ...categories.map((categoryId, index) => ({
        sql: `INSERT INTO situation_version_teaching_categories
          (situation_key, situation_revision, category_id, is_primary, sort_order)
         SELECT ?1, ?2, ?3, ?4, ?5
          WHERE EXISTS (
            SELECT 1 FROM situation_versions
             WHERE situation_key = ?1 AND revision = ?2 AND payload_json = ?6
          )`,
        params: [situation.key, revision, categoryId, index === 0 ? 1 : 0, index, payload],
      })),
    ];
  }

  private outcomeCommands(situation: Situation, revision: number, payload: string, replaceCurrent = false) {
    const { playOutcome, runnerOutcomes } = normalizeSituationOutcomes(situation);
    const playParams = [
      situation.key, revision, playOutcome.result, playOutcome.batterResult,
      playOutcome.outsRecorded, playOutcome.batterOutType || null,
      playOutcome.batterOutOrder || null, playOutcome.reviewStatus, payload,
    ];
    return [
      ...(replaceCurrent ? [{
        sql: `DELETE FROM situation_runner_outcomes
               WHERE situation_key = ?1
                 AND EXISTS (SELECT 1 FROM situations WHERE key = ?1 AND revision = ?2 AND payload_json = ?3)`,
        params: [situation.key, revision, payload],
      }, {
        sql: `DELETE FROM situation_play_outcomes
               WHERE situation_key = ?1
                 AND EXISTS (SELECT 1 FROM situations WHERE key = ?1 AND revision = ?2 AND payload_json = ?3)`,
        params: [situation.key, revision, payload],
      }] : []),
      {
        sql: `INSERT INTO situation_play_outcomes
          (situation_key, play_result, batter_result, outs_recorded,
           batter_out_type, batter_out_order, review_status)
         SELECT ?1, ?3, ?4, ?5, ?6, ?7, ?8
          WHERE EXISTS (SELECT 1 FROM situations WHERE key = ?1 AND revision = ?2 AND payload_json = ?9)`,
        params: playParams,
      },
      ...runnerOutcomes.map((runner) => ({
        sql: `INSERT INTO situation_runner_outcomes
          (situation_key, starting_base, runner_result, out_type, out_order, tagged_up)
         SELECT ?1, ?3, ?4, ?5, ?6, ?7
          WHERE EXISTS (SELECT 1 FROM situations WHERE key = ?1 AND revision = ?2 AND payload_json = ?8)`,
        params: [situation.key, revision, runner.startingBase, runner.result,
          runner.outType || null, runner.outOrder || null, runner.taggedUp ? 1 : 0, payload],
      })),
      {
        sql: `INSERT OR IGNORE INTO situation_version_play_outcomes
          (situation_key, situation_revision, play_result, batter_result,
           outs_recorded, batter_out_type, batter_out_order, review_status)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
          WHERE EXISTS (
            SELECT 1 FROM situation_versions
             WHERE situation_key = ?1 AND revision = ?2 AND payload_json = ?9
          )`,
        params: playParams,
      },
      ...runnerOutcomes.map((runner) => ({
        sql: `INSERT OR IGNORE INTO situation_version_runner_outcomes
          (situation_key, situation_revision, starting_base, runner_result,
           out_type, out_order, tagged_up)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
          WHERE EXISTS (
            SELECT 1 FROM situation_version_play_outcomes
             WHERE situation_key = ?1 AND situation_revision = ?2
          )`,
        params: [situation.key, revision, runner.startingBase, runner.result,
          runner.outType || null, runner.outOrder || null, runner.taggedUp ? 1 : 0],
      })),
    ];
  }

  async list(includeArchived = false): Promise<SituationRecord[]> {
    const rows = await this.database.all<SituationRow>(
      `SELECT key, display_code, category, difficulty, difficulty_level, payload_json, revision, active, archived_at
         FROM situations ${includeArchived ? '' : 'WHERE active = 1'}
        ORDER BY CAST(substr(display_code, 2) AS INTEGER), display_code, key`,
    );
    const [categories, playOutcomes, runnerOutcomes] = await Promise.all([
      this.categories(), this.playOutcomes(), this.runnerOutcomes(),
    ]);
    return rows.map((row) => mapRow(row, categories, playOutcomes, runnerOutcomes));
  }

  async get(key: string, includeArchived = false): Promise<SituationRecord | null> {
    const row = await this.database.one<SituationRow>(
      `SELECT key, display_code, category, difficulty, difficulty_level, payload_json, revision, active, archived_at
         FROM situations WHERE key = ?1 ${includeArchived ? '' : 'AND active = 1'}`,
      [key],
    );
    if (!row) return null;
    const [categories, playOutcomes, runnerOutcomes] = await Promise.all([
      this.categories(), this.playOutcomes(), this.runnerOutcomes(),
    ]);
    return mapRow(row, categories, playOutcomes, runnerOutcomes);
  }

  async create(situationInput: Situation, userId: string): Promise<SituationRecord> {
    const situation = validateSituation(situationInput);
    if (await this.get(situation.key, true)) {
      throw new RecordValidationError('A situation with that key already exists.');
    }
    const now = new Date().toISOString();
    const payload = JSON.stringify(situation);
    const legacyDifficulty = situation.difficulty === 'foundational' ? 'beginner' : situation.difficulty;
    const [result] = await this.database.batch([
      {
        sql: `INSERT INTO situations
          (key, title, description, category, difficulty, difficulty_level, payload_json, revision, active, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 1, ?8, ?9, ?9)`,
        params: [situation.key, situation.title, situation.desc || '', situation.category, legacyDifficulty, situation.difficulty, payload, userId, now],
      },
      {
        sql: `INSERT OR IGNORE INTO situation_versions
          (situation_key, revision, title, category, difficulty, payload_json, created_at)
         SELECT key, revision, title, category, difficulty_level, payload_json, ?2
           FROM situations WHERE key = ?1 AND revision = 1`,
        params: [situation.key, now],
      },
      ...this.categoryCommands(situation, 1, payload),
      ...this.outcomeCommands(situation, 1, payload),
    ]);
    if (!result.changes) throw new RecordValidationError('A situation with that key already exists.');
    const created = await this.get(situation.key, true);
    await writeAudit(this.database, userId, 'create', 'situation', situation.key, null, created);
    return created!;
  }

  async update(situationInput: Situation, expectedRevision: number, userId: string): Promise<SituationRecord> {
    const situation = validateSituation(situationInput);
    const before = await this.get(situation.key, true);
    if (!before) throw new RecordNotFoundError('Situation not found.');
    const now = new Date().toISOString();
    const legacyDifficulty = situation.difficulty === 'foundational' ? 'beginner' : situation.difficulty;
    const [result] = await this.database.batch([
      {
        sql: `UPDATE situations SET title = ?2, description = ?3, category = ?4, difficulty = ?5,
                               difficulty_level = ?6, payload_json = ?7, revision = revision + 1,
                               active = 1, updated_at = ?8
          WHERE key = ?1 AND revision = ?9`,
        params: [situation.key, situation.title, situation.desc || '', situation.category, legacyDifficulty, situation.difficulty, JSON.stringify(situation), now, expectedRevision],
      },
      {
        sql: `INSERT OR IGNORE INTO situation_versions
          (situation_key, revision, title, category, difficulty, payload_json, created_at)
         SELECT key, revision, title, category, difficulty_level, payload_json, ?3
           FROM situations WHERE key = ?1 AND revision = ?2 + 1`,
        params: [situation.key, expectedRevision, now],
      },
      ...this.categoryCommands(situation, expectedRevision + 1, JSON.stringify(situation), true),
      ...this.outcomeCommands(situation, expectedRevision + 1, JSON.stringify(situation), true),
    ]);
    if (!result.changes) throw new RevisionConflictError();
    const updated = await this.get(situation.key, true);
    await writeAudit(this.database, userId, 'update', 'situation', situation.key, before, updated);
    return updated!;
  }

  async setActive(key: string, active: boolean, expectedRevision: number, userId: string): Promise<SituationRecord> {
    const before = await this.get(key, true);
    if (!before) throw new RecordNotFoundError('Situation not found.');
    const now = new Date().toISOString();
    const [result] = await this.database.batch([
      {
        sql: `UPDATE situations SET active = ?2, revision = revision + 1, updated_at = ?3,
                               archived_at = ?4, archived_by = ?5
          WHERE key = ?1 AND revision = ?6`,
        params: [key, active ? 1 : 0, now, active ? null : now, active ? null : userId, expectedRevision],
      },
      {
        sql: `INSERT OR IGNORE INTO situation_versions
          (situation_key, revision, title, category, difficulty, payload_json, created_at)
         SELECT key, revision, title, category, difficulty_level, payload_json, ?3
           FROM situations WHERE key = ?1 AND revision = ?2 + 1`,
        params: [key, expectedRevision, now],
      },
      {
        sql: `INSERT OR IGNORE INTO situation_version_teaching_categories
          (situation_key, situation_revision, category_id, is_primary, sort_order)
         SELECT situation_key, ?2, category_id, is_primary, sort_order
           FROM situation_teaching_categories WHERE situation_key = ?1`,
        params: [key, expectedRevision + 1],
      },
      {
        sql: `INSERT OR IGNORE INTO situation_version_play_outcomes
          (situation_key, situation_revision, play_result, batter_result,
           outs_recorded, batter_out_type, batter_out_order, review_status)
         SELECT situation_key, ?2, play_result, batter_result, outs_recorded,
                batter_out_type, batter_out_order, review_status
           FROM situation_play_outcomes WHERE situation_key = ?1`,
        params: [key, expectedRevision + 1],
      },
      {
        sql: `INSERT OR IGNORE INTO situation_version_runner_outcomes
          (situation_key, situation_revision, starting_base, runner_result,
           out_type, out_order, tagged_up)
         SELECT situation_key, ?2, starting_base, runner_result,
                out_type, out_order, tagged_up
           FROM situation_runner_outcomes WHERE situation_key = ?1`,
        params: [key, expectedRevision + 1],
      },
    ]);
    if (!result.changes) throw new RevisionConflictError();
    const updated = await this.get(key, true);
    await writeAudit(this.database, userId, active ? 'restore' : 'archive', 'situation', key, before, updated);
    return updated!;
  }
}
