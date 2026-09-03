import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteTeamRepository } from '$lib/server/repositories/teams';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const DELETE: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  try {
    const repository = new SqliteTeamRepository(databaseFor(event));
    const preview = await repository.deletionPreview(event.params.teamId);
    const body = await event.request.json() as {
      confirmation?: string;
      deletePlayers?: boolean;
    };
    if (body.confirmation !== preview.teamName) {
      return json({ error: 'Type the team name exactly to confirm permanent deletion.' }, { status: 400 });
    }
    const removed = await repository.deletePermanently(
      event.params.teamId,
      user.id,
      body.deletePlayers === true,
    );
    return json({ ok: true, removed });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
