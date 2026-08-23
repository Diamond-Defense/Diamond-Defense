import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteSituationSubmissionRepository } from '$lib/server/repositories/situation-submissions';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const DELETE: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['coach']);
  try {
    const record = await new SqliteSituationSubmissionRepository(
      databaseFor(event),
    ).withdraw(event.params.id, user.id);
    return json({ ok: true, record });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
