import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Situation } from '$lib/domain/models';
import { databaseFor } from '$lib/server/database/context';
import { SqliteSituationRepository } from '$lib/server/repositories/situations';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const PUT: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['coach', 'admin']);
  const situation = (await event.request.json()) as Situation;
  situation.key = event.params.key;
  await new SqliteSituationRepository(databaseFor(event)).save(situation, user.id);
  return json({ ok: true, key: situation.key });
};

export const DELETE: RequestHandler = async (event) => {
  assertSameOrigin(event);
  await requireUser(event, ['coach', 'admin']);
  await new SqliteSituationRepository(databaseFor(event)).remove(event.params.key);
  return json({ ok: true });
};
