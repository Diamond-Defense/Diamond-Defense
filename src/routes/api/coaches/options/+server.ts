import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqliteTeamRepository } from '$lib/server/repositories/teams';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const teams = await new SqliteTeamRepository(
    databaseFor(event),
  ).listCoachOptions();
  return json({ version: 1, teams });
};
