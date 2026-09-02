import type { Situation } from '$lib/domain/models';
import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';
import { writeAudit } from './audit';
import {
  RecordNotFoundError,
  RecordValidationError,
  RevisionConflictError,
} from './errors';

interface SituationRow {
  key: string;
  category: string;
  difficulty: string;
  payload_json: string;
  revision: number;
  active: number;
  archived_at: string | null;
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
  const difficulty = String(situation?.difficulty || '').trim().toLowerCase();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/.test(key)) {
    throw new RecordValidationError('Situation key must use 2–80 letters, numbers, hyphens, or underscores.');
  }
  if (!title || title.length > 120) {
    throw new RecordValidationError('Situation title is required and must be 120 characters or fewer.');
  }
  if (!category || category.length > 60) {
    throw new RecordValidationError('Situation category is required and must be 60 characters or fewer.');
  }
  if (!['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
    throw new RecordValidationError('Situation difficulty must be beginner, intermediate, or advanced.');
  }
  return { ...situation, key, title, category, difficulty } as Situation;
}

function mapRow(row: SituationRow): SituationRecord {
  return {
    ...(JSON.parse(row.payload_json) as Situation),
    category: row.category,
    difficulty: row.difficulty as Situation['difficulty'],
    revision: Number(row.revision),
    active: Boolean(row.active),
    archivedAt: row.archived_at,
  };
}

export class SqliteSituationRepository {
  constructor(private readonly database: SqliteDatabaseAdapter) {}

  async list(includeArchived = false): Promise<SituationRecord[]> {
    const rows = await this.database.all<SituationRow>(
      `SELECT key, category, difficulty, payload_json, revision, active, archived_at
         FROM situations ${includeArchived ? '' : 'WHERE active = 1'} ORDER BY key`,
    );
    return rows.map(mapRow);
  }

  async get(key: string, includeArchived = false): Promise<SituationRecord | null> {
    const row = await this.database.one<SituationRow>(
      `SELECT key, category, difficulty, payload_json, revision, active, archived_at
         FROM situations WHERE key = ?1 ${includeArchived ? '' : 'AND active = 1'}`,
      [key],
    );
    return row ? mapRow(row) : null;
  }

  async create(situationInput: Situation, userId: string): Promise<SituationRecord> {
    const situation = validateSituation(situationInput);
    const now = new Date().toISOString();
    const payload = JSON.stringify(situation);
    const [result] = await this.database.batch([
      {
        sql: `INSERT OR IGNORE INTO situations
          (key, title, description, category, difficulty, payload_json, revision, active, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 1, ?7, ?8, ?8)`,
        params: [situation.key, situation.title, situation.desc || '', situation.category, situation.difficulty, payload, userId, now],
      },
      {
        sql: `INSERT OR IGNORE INTO situation_versions
          (situation_key, revision, title, category, difficulty, payload_json, created_at)
         SELECT key, revision, title, category, difficulty, payload_json, ?2
           FROM situations WHERE key = ?1 AND revision = 1`,
        params: [situation.key, now],
      },
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
    const [result] = await this.database.batch([
      {
        sql: `UPDATE situations SET title = ?2, description = ?3, category = ?4, difficulty = ?5,
                               payload_json = ?6, revision = revision + 1, active = 1, updated_at = ?7
          WHERE key = ?1 AND revision = ?8`,
        params: [situation.key, situation.title, situation.desc || '', situation.category, situation.difficulty, JSON.stringify(situation), now, expectedRevision],
      },
      {
        sql: `INSERT OR IGNORE INTO situation_versions
          (situation_key, revision, title, category, difficulty, payload_json, created_at)
         SELECT key, revision, title, category, difficulty, payload_json, ?3
           FROM situations WHERE key = ?1 AND revision = ?2 + 1`,
        params: [situation.key, expectedRevision, now],
      },
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
         SELECT key, revision, title, category, difficulty, payload_json, ?3
           FROM situations WHERE key = ?1 AND revision = ?2 + 1`,
        params: [key, expectedRevision, now],
      },
    ]);
    if (!result.changes) throw new RevisionConflictError();
    const updated = await this.get(key, true);
    await writeAudit(this.database, userId, active ? 'restore' : 'archive', 'situation', key, before, updated);
    return updated!;
  }
}
