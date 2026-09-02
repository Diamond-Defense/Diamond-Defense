import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import {
  SqlitePracticeAssignmentRepository,
  type PracticeAssignmentInput,
} from '$lib/server/repositories/practice-assignments';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { assertSameOrigin, requireTeamManager, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

function pagination(url: URL): { page: number; pageSize: number } {
  const requestedPage = Number(url.searchParams.get('page') || 1);
  const requestedPageSize = Number(url.searchParams.get('pageSize') || 6);
  return {
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    pageSize: Number.isInteger(requestedPageSize)
      ? Math.min(20, Math.max(1, requestedPageSize))
      : 6,
  };
}

export const GET: RequestHandler = async (event) => {
  const user = await requireUser(event, ['player', 'coach', 'admin']);
  const { page, pageSize } = pagination(event.url);
  const repository = new SqlitePracticeAssignmentRepository(databaseFor(event));
  const result = user.role === 'player'
    ? await repository.listForPlayer(user.id, page, pageSize)
    : await repository.listForTeam(
      user.role === 'coach' ? String(user.teamId || '') : String(event.url.searchParams.get('teamId') || ''),
      page,
      pageSize,
    );
  const totalPages = Math.max(1, Math.ceil(result.total / pageSize));
  return json({
    ...result,
    page,
    pageSize,
    totalPages,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
};

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['coach', 'admin']);
  const body = (await event.request.json()) as PracticeAssignmentInput & { teamId?: string };
  const teamId = user.role === 'coach' ? String(user.teamId || '') : String(body.teamId || '');
  if (!teamId) return json({ error: 'A team is required.' }, { status: 400 });
  await requireTeamManager(event, teamId);
  try {
    const assignment = await new SqlitePracticeAssignmentRepository(databaseFor(event))
      .create(teamId, user.id, body);
    return json({ ok: true, assignment }, { status: 201 });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
