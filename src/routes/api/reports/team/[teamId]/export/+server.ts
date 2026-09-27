import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqliteAttemptRepository } from '$lib/server/repositories/attempts';
import { attemptsCsv, parseAttemptReportFilters } from '$lib/server/results/reporting';
import { requireTrainingManager } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const teamId = event.params.teamId;
  await requireTrainingManager(event, teamId);
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
