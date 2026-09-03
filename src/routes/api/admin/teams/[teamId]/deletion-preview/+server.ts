import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteTeamRepository } from '$lib/server/repositories/teams';
import { requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  await requireUser(event, ['admin']);
  try {
    return json({
      preview: await new SqliteTeamRepository(databaseFor(event))
        .deletionPreview(event.params.teamId),
    });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
