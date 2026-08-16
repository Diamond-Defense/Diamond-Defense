import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqliteAttemptRepository } from '$lib/server/repositories/attempts';
import { requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const user = await requireUser(event, ['coach', 'admin']);
  const teamId = event.params.teamId;
  if (user.role === 'coach' && user.teamId !== teamId) {
    return json({ error: 'Coaches may only view their own team.' }, { status: 403 });
  }
  const attempts = await new SqliteAttemptRepository(databaseFor(event)).listForTeam(teamId);
  return json({ teamId, attempts });
};
