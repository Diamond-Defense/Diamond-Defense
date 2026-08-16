import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  await requireUser(event, ['admin']);
  const rows = await databaseFor(event).all(
    `SELECT id, actor_user_id AS actorUserId, action, entity_type AS entityType,
            entity_id AS entityId, before_json AS beforeJson, after_json AS afterJson,
            created_at AS createdAt
       FROM audit_log ORDER BY created_at DESC LIMIT 200`,
  );
  return json({ entries: rows });
};
