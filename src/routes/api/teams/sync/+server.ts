import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const PUT: RequestHandler = async (event) => {
  assertSameOrigin(event);
  await requireUser(event, ['admin']);
  return json(
    { error: 'Bulk synchronization has been retired. Use the record-level administration API.' },
    { status: 410 },
  );
};
