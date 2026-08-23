import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import {
  commitTeamCsvImport,
  planTeamCsvImport,
  TeamCsvStalePreviewError,
  TeamCsvValidationError,
  teamCsvTemplate,
} from '$lib/server/imports/team-csv';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

const MAX_CSV_BYTES = 512 * 1024;

export const GET: RequestHandler = async (event) => {
  await requireUser(event, ['admin']);
  return new Response(`\uFEFF${teamCsvTemplate()}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="diamond-defense-team-import-template.csv"',
      'Cache-Control': 'private, no-store',
    },
  });
};

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  const body = await event.request.json() as {
    mode?: string;
    csv?: string;
    fingerprint?: string;
  };
  const csv = String(body.csv || '');
  if (!csv.trim()) return json({ error: 'Choose a CSV file first.' }, { status: 400 });
  if (new TextEncoder().encode(csv).byteLength > MAX_CSV_BYTES) {
    return json({ error: 'The CSV file must be 512 KB or smaller.' }, { status: 413 });
  }
  if (body.mode === 'preview') {
    const plan = await planTeamCsvImport(databaseFor(event), csv);
    return json(plan.preview, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  if (body.mode === 'commit') {
    try {
      const preview = await commitTeamCsvImport(
        databaseFor(event),
        csv,
        String(body.fingerprint || ''),
        user.id,
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
