import type { Situation } from '$lib/domain/models';
import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';

interface SituationRow {
  payload_json: string;
}

export class SqliteSituationRepository {
  constructor(private readonly database: SqliteDatabaseAdapter) {}

  async list(): Promise<Situation[]> {
    const rows = await this.database.all<SituationRow>(
      'SELECT payload_json FROM situations WHERE active = 1 ORDER BY key',
    );
    return rows.map(({ payload_json }) => JSON.parse(payload_json) as Situation);
  }

  async get(key: string): Promise<Situation | null> {
    const row = await this.database.one<SituationRow>(
      'SELECT payload_json FROM situations WHERE key = ?1 AND active = 1',
      [key],
    );
    return row ? (JSON.parse(row.payload_json) as Situation) : null;
  }

  async save(situation: Situation, userId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.database.execute(
      `INSERT INTO situations
        (key, title, description, payload_json, revision, active, created_by, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 1, 1, ?5, ?6, ?6)
       ON CONFLICT(key) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         payload_json = excluded.payload_json,
         revision = situations.revision + 1,
         active = 1,
         updated_at = excluded.updated_at`,
      [
        situation.key,
        situation.title || situation.key,
        situation.desc || '',
        JSON.stringify(situation),
        userId,
        now,
      ],
    );
  }

  async remove(key: string): Promise<void> {
    await this.database.execute('DELETE FROM situations WHERE key = ?1', [key]);
  }
}
