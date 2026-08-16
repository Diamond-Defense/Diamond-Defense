import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { destroySession } from '$lib/server/security/sessions';
import { assertSameOrigin } from '$lib/server/security/authorization';

export const prerender = false;

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  await destroySession(databaseFor(event), event.cookies);
  return json({ ok: true });
};
