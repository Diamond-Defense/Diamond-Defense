import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteTeamRepository } from '$lib/server/repositories/teams';
import { assertSameOrigin, requireTeamManager } from '$lib/server/security/authorization';

export const prerender = false;

export const PUT: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireTeamManager(event, event.params.teamId);
  try {
    const body = (await event.request.json()) as { password?: string };
    await new SqliteTeamRepository(databaseFor(event)).resetPassword(event.params.userId, body.password, user.id);
    return json({ ok: true });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
