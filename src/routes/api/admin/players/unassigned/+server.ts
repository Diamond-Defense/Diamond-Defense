import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqliteTeamRepository } from '$lib/server/repositories/teams';
import { requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  await requireUser(event, ['admin']);
  return json(
    { players: await new SqliteTeamRepository(databaseFor(event)).listUnassignedPlayers() },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
};
