import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqlitePracticeAssignmentRepository } from '$lib/server/repositories/practice-assignments';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['player']);
  try {
    const state = await new SqlitePracticeAssignmentRepository(databaseFor(event))
      .startForPlayer(event.params.id, user.id);
    return json({ ok: true, ...state });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
