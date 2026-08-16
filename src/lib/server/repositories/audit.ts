import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';

export async function writeAudit(
  database: SqliteDatabaseAdapter,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await database.execute(
    `INSERT INTO audit_log
      (id, actor_user_id, action, entity_type, entity_id, before_json, after_json, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [
      crypto.randomUUID(),
      actorUserId,
      action,
      entityType,
      entityId,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      new Date().toISOString(),
    ],
  );
}
