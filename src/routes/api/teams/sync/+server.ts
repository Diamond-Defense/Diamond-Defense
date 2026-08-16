import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqliteTeamRepository } from '$lib/server/repositories/teams';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const PUT: RequestHandler = async (event) => {
  assertSameOrigin(event);
  await requireUser(event, ['admin']);
  const body = (await event.request.json()) as { teams?: unknown[] };
  if (!Array.isArray(body.teams)) {
    return json({ error: 'A teams array is required.' }, { status: 400 });
  }
  try {
    await new SqliteTeamRepository(databaseFor(event)).sync(body.teams as never[]);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
  return json({ ok: true });
};
