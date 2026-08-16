import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqliteAttemptRepository } from '$lib/server/repositories/attempts';
import { summarizeAttempts } from '$lib/server/results/summary';
import { requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const user = await requireUser(event, ['player']);
  const log = await new SqliteAttemptRepository(databaseFor(event)).listForPlayer(user.id);
  return json({ playerId: user.id, log, bySituation: summarizeAttempts(log) });
};
