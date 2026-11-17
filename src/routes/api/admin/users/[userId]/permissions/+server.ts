import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const GET: RequestHandler = async event => {
  await requireUser(event, ['admin']);
  const database = databaseFor(event);
  const user = await database.one("SELECT id FROM users WHERE id = ?1 AND role = 'coach' AND active = 1", [event.params.userId]);
  if (!user) return json({ error: 'Active staff account not found.' }, { status: 404 });
  const permissions = await database.one<{ publish_situations: number }>(
    'SELECT publish_situations FROM coach_permissions WHERE user_id = ?1', [event.params.userId],
  );
  return json({ canPublishSituations: Boolean(permissions?.publish_situations) }, { headers: { 'Cache-Control': 'no-store' } });
};

export const PUT: RequestHandler = async event => {
  assertSameOrigin(event);
  await requireUser(event, ['admin']);
  return json({ error: 'Manage Designer access through People & access.' }, { status: 410 });
};
