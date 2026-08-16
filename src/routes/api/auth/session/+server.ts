import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { currentUser } from '$lib/server/security/sessions';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const user = await currentUser(databaseFor(event), event.cookies);
  return json({ user });
};
