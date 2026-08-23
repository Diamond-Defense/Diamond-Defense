import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqliteAttemptRepository } from '$lib/server/repositories/attempts';
import { parseAttemptReportFilters } from '$lib/server/results/reporting';
import { requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const user = await requireUser(event, ['coach', 'admin']);
  const teamId = event.params.teamId;
  if (user.role === 'coach' && user.teamId !== teamId) {
    return json({ error: 'Coaches may only view their own team.' }, { status: 403 });
  }
  const requestedPage = Number(event.url.searchParams.get('page') || 1);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const filters = parseAttemptReportFilters(event.url.searchParams);
  const playerId = filters.playerId || '';
  const pageSize = playerId ? 3 : 5;
  const repository = new SqliteAttemptRepository(databaseFor(event));
  const [result, summary] = await Promise.all([
    playerId
      ? repository.listForTeamPlayer(teamId, playerId, pageSize, (page - 1) * pageSize, filters)
      : repository.listLatestPerPlayer(teamId, pageSize, (page - 1) * pageSize, filters),
    repository.summarizeForTeam(teamId, filters),
  ]);
  const totalPages = Math.max(1, Math.ceil(result.total / pageSize));
  return json(
    {
      teamId,
      playerId: playerId || null,
      mode: playerId ? 'player' : 'activity',
      filters,
      summary,
      page,
      pageSize,
      total: result.total,
      totalPages,
      hasPrevious: page > 1,
      hasNext: page < totalPages,
      attempts: result.attempts,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
};
