import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqliteTeamRepository, type TeamInput } from '$lib/server/repositories/teams';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  await requireUser(event, ['admin']);
  const includeArchived = event.url.searchParams.get('includeArchived') === 'true';
  return json({ teams: await new SqliteTeamRepository(databaseFor(event)).listForAdministration(includeArchived) });
};

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  try {
    const record = await new SqliteTeamRepository(databaseFor(event)).create(
      (await event.request.json()) as TeamInput,
      user.id,
    );
    return json({ ok: true, record }, { status: 201 });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
