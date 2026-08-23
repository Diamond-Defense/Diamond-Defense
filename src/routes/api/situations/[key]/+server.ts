import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Situation } from '$lib/domain/models';
import { databaseFor } from '$lib/server/database/context';
import { SqliteSituationRepository } from '$lib/server/repositories/situations';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';
import { expectedRevision } from '$lib/server/http/revisions';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';

export const prerender = false;

export const PUT: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  const situation = (await event.request.json()) as Situation;
  situation.key = event.params.key;
  try {
    const record = await new SqliteSituationRepository(databaseFor(event)).update(
      situation,
      expectedRevision(event.request),
      user.id,
    );
    return json({ ok: true, record });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};

export const DELETE: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  try {
    const record = await new SqliteSituationRepository(databaseFor(event)).setActive(
      event.params.key,
      false,
      expectedRevision(event.request),
      user.id,
    );
    return json({ ok: true, record });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
