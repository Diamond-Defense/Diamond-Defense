import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqlitePracticeAssignmentRepository } from '$lib/server/repositories/practice-assignments';
import { requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const user = await requireUser(event, ['player']);
  const state = await new SqlitePracticeAssignmentRepository(databaseFor(event))
    .playerState(user.id);
  return json(state, { headers: { 'Cache-Control': 'private, no-store' } });
};
