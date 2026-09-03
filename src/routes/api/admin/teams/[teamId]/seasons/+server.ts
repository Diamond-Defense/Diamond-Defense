import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteSeasonRepository, type SeasonInput } from '$lib/server/repositories/seasons';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  await requireUser(event, ['admin']);
  const repository = new SqliteSeasonRepository(databaseFor(event));
  return json({
    seasons: await repository.list(event.params.teamId),
    members: await repository.listMembers(event.params.teamId),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
};

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  try {
    const season = await new SqliteSeasonRepository(databaseFor(event)).create(
      event.params.teamId,
      (await event.request.json()) as SeasonInput,
      user.id,
    );
    return json({ ok: true, season }, { status: 201 });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
