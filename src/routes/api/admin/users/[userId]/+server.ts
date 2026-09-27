import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteSeasonRepository } from '$lib/server/repositories/seasons';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const DELETE: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  const body = await event.request.json() as { confirmation?: string };
  if (body.confirmation !== 'DELETE PLAYER PERMANENTLY') {
    return json({ error: 'Permanent deletion confirmation is required.' }, { status: 400 });
  }
  try {
    const removed = await new SqliteSeasonRepository(databaseFor(event))
      .deletePlayerPermanently(event.params.userId, user.id);
    return json({ ok: true, removed });
  } catch (error) {
    const response = repositoryErrorResponse(error);
    if (response.status !== 500) return response;
    // This endpoint is admin-only. Surface the database cause so a failed
    // deletion can be diagnosed without implying that any account was removed.
    const messages: string[] = [];
    let cause: unknown = error;
    for (let depth = 0; cause instanceof Error && depth < 4; depth++) {
      if (!messages.includes(cause.message)) messages.push(cause.message);
      cause = (cause as Error & { cause?: unknown }).cause;
    }
    const detail = messages.join(' — ').slice(0, 1500);
    return json({ error: `Player deletion failed: ${detail || 'Unknown database error.'}` }, { status: 500 });
  }
};
