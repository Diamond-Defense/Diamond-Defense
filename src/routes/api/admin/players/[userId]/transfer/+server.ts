import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteTeamRepository } from '$lib/server/repositories/teams';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  try {
    const input = await event.request.json() as { destinationTeamId?: string; number?: string };
    const record = await new SqliteTeamRepository(databaseFor(event)).transferPlayer(
      event.params.userId,
      String(input.destinationTeamId || ''),
      input.number,
      user.id,
    );
    return json({ ok: true, record });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
