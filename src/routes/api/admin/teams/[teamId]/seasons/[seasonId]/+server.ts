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
  try {
    const repository = new SqliteSeasonRepository(databaseFor(event));
    const season = await repository.get(event.params.teamId, event.params.seasonId);
    if (!season) return json({ error: 'Season not found.' }, { status: 404 });
    const body = await event.request.json() as { confirmation?: string };
    if (body.confirmation !== season.name) {
      return json({ error: 'Type the season name exactly to confirm permanent deletion.' }, { status: 400 });
    }
    const removed = await repository.deleteClosedSeason(
      event.params.teamId,
      event.params.seasonId,
      user.id,
    );
    return json({ ok: true, removed });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};

export const PATCH: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  const body = await event.request.json() as { action?: string };
  const repository = new SqliteSeasonRepository(databaseFor(event));
  try {
    const season = body.action === 'close'
      ? await repository.close(event.params.teamId, event.params.seasonId, user.id)
      : null;
    if (!season) return json({ error: 'Season action is invalid.' }, { status: 400 });
    return json({ ok: true, season });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
