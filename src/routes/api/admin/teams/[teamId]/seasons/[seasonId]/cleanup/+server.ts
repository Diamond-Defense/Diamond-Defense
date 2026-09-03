import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteSeasonRepository } from '$lib/server/repositories/seasons';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  await requireUser(event, ['admin']);
  try {
    const preview = await new SqliteSeasonRepository(databaseFor(event)).cleanupPreview(
      event.params.teamId,
      event.params.seasonId,
      event.url.searchParams.get('playerId') || undefined,
    );
    return json({ preview }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  const body = await event.request.json() as { playerId?: string; confirmation?: string };
  if (body.confirmation !== 'CLEAR SEASON RECORDS') {
    return json({ error: 'Cleanup confirmation is required.' }, { status: 400 });
  }
  try {
    const removed = await new SqliteSeasonRepository(databaseFor(event)).clearPlayerRecords(
      event.params.teamId,
      event.params.seasonId,
      String(body.playerId || ''),
      user.id,
    );
    return json({ ok: true, removed });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
