import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqliteAttemptRepository } from '$lib/server/repositories/attempts';
import { attemptsCsv, parseAttemptReportFilters } from '$lib/server/results/reporting';
import { requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const user = await requireUser(event, ['coach', 'admin']);
  const teamId = event.params.teamId;
  if (user.role === 'coach' && user.teamId !== teamId) {
    return new Response('Coaches may only export their own team.', { status: 403 });
  }
  const filters = parseAttemptReportFilters(event.url.searchParams);
  const attempts = await new SqliteAttemptRepository(databaseFor(event))
    .listFilteredForTeam(teamId, filters);
  const filenameTeam = teamId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    || 'team';
  return new Response(attemptsCsv(attempts), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="diamond-defense-${filenameTeam}-results.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
};
