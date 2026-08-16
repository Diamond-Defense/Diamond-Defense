import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  await databaseFor(event).one<{ ok: number }>('SELECT 1 AS ok');
  return json({ ok: true, database: 'sqlite' });
};
