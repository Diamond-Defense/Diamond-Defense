import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { writeAudit } from '$lib/server/repositories/audit';
import { assertSameOrigin } from '$lib/server/security/authorization';
import { currentUser, destroyAllSessions } from '$lib/server/security/sessions';

export const prerender = false;

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const database = databaseFor(event);
  const user = await currentUser(database, event.cookies);
  if (!user) return json({ ok: true });
  await destroyAllSessions(database, event.cookies, user.id);
  await writeAudit(database, user.id, 'logout_all', 'user', user.id, null, {
    signedOutEverywhere: true,
  });
  return json({ ok: true });
};
