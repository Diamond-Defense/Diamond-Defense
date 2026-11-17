import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import {
  commitTeamCsvImport,
  planTeamCsvImport,
  TeamCsvStalePreviewError,
  TeamCsvValidationError,
  teamCsvTemplate,
  teamRosterCsv,
} from '$lib/server/imports/team-csv';
import { SqliteTeamRepository } from '$lib/server/repositories/teams';
import { assertSameOrigin, requireDirectorTeamManager, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

const MAX_CSV_BYTES = 512 * 1024;

export const GET: RequestHandler = async (event) => {
  const teamId = event.url.searchParams.get('teamId');
  if (teamId) await requireDirectorTeamManager(event, teamId);
  else await requireUser(event, ['admin']);
  const download = event.url.searchParams.get('download') === 'export' ? 'export' : 'template';
  const team = teamId ? await new SqliteTeamRepository(databaseFor(event)).get(teamId) : null;
  if (teamId && !team?.active) return json({ error: 'Active team not found.' }, { status: 404 });
  const csv = team ? teamRosterCsv(team, download) : teamCsvTemplate();
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="diamond-defense-team-import-template.csv"',
      'Cache-Control': 'private, no-store',
    },
  });
};

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const body = await event.request.json() as {
    mode?: string;
    csv?: string;
    fingerprint?: string;
    teamId?: string;
  };
  const teamId = typeof body.teamId === 'string' ? body.teamId.trim() : '';
  const user = teamId ? await requireDirectorTeamManager(event, teamId) : await requireUser(event, ['admin']);
  const playersOnly = user.role !== 'admin';
  const csv = String(body.csv || '');
  if (!csv.trim()) return json({ error: 'Choose a CSV file first.' }, { status: 400 });
  if (new TextEncoder().encode(csv).byteLength > MAX_CSV_BYTES) {
    return json({ error: 'The CSV file must be 512 KB or smaller.' }, { status: 413 });
  }
  if (body.mode === 'preview') {
    const plan = await planTeamCsvImport(databaseFor(event), csv, teamId, playersOnly);
    return json(plan.preview, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  if (body.mode === 'commit') {
    try {
      const preview = await commitTeamCsvImport(
        databaseFor(event),
        csv,
        String(body.fingerprint || ''),
        user.id,
        teamId,
        playersOnly,
      );
      return json({ ok: true, summary: preview.summary });
    } catch (error) {
      if (error instanceof TeamCsvStalePreviewError) {
        return json({ error: error.message }, { status: 409 });
      }
      if (error instanceof TeamCsvValidationError) {
        return json({ error: error.message }, { status: 422 });
      }
      console.error(error);
      return json({ error: 'Unable to apply the CSV import.' }, { status: 500 });
    }
  }
  return json({ error: 'Import mode must be preview or commit.' }, { status: 400 });
};
