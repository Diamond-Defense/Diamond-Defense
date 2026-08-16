import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Situation } from '$lib/domain/models';
import { databaseFor } from '$lib/server/database/context';
import { SqliteSituationRepository } from '$lib/server/repositories/situations';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const situations = await new SqliteSituationRepository(databaseFor(event)).list();
  return json(situations);
};

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['coach', 'admin']);
  const situation = (await event.request.json()) as Situation;
  if (!situation?.key || !situation?.title) {
    return json({ error: 'Situation key and title are required.' }, { status: 400 });
  }
  try {
    const record = await new SqliteSituationRepository(databaseFor(event)).create(situation, user.id);
    return json({ ok: true, record }, { status: 201 });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
