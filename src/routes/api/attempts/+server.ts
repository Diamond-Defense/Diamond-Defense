import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqliteAttemptRepository, type AttemptInput } from '$lib/server/repositories/attempts';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['player']);
  if (!user.teamId) {
    return json({ error: 'Player is not assigned to a team.' }, { status: 400 });
  }
  const attempt = (await event.request.json()) as AttemptInput;
  if (!attempt.situationKey || (attempt.phase !== 1 && attempt.phase !== 2)) {
    return json({ error: 'A valid situation and phase are required.' }, { status: 400 });
  }
  await new SqliteAttemptRepository(databaseFor(event)).save(user.id, user.teamId, attempt);
  return json({ ok: true }, { status: 201 });
};
