import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteTeamRepository, type AdvanceRosterInput } from '$lib/server/repositories/teams';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  try {
    const result = await new SqliteTeamRepository(databaseFor(event)).advanceRoster(
      event.params.teamId,
      (await event.request.json()) as AdvanceRosterInput,
      user.id,
    );
    return json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
