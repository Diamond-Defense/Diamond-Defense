import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqliteTeamRepository, type TeamInput } from '$lib/server/repositories/teams';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { assertSameOrigin, directsRegion, requireOrgWorkspace } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const actor = await requireOrgWorkspace(event);
  const database = databaseFor(event);
  const includeArchived = event.url.searchParams.get('includeArchived') === 'true';
  const teams = await new SqliteTeamRepository(database).listForAdministration(includeArchived);
  if (actor.role === 'admin') return json({ teams });

  const scopes = await database.all<{ teamId: string; id: string; organizationId: string }>(
    'SELECT t.id AS teamId, r.id, r.organization_id AS organizationId FROM teams t JOIN regions r ON r.id = t.region_id',
  );
  const allowed = new Set(scopes.filter(scope => directsRegion(actor, scope)).map(scope => scope.teamId));
  return json({ teams: teams.filter(team => allowed.has(team.id)) });

};

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireOrgWorkspace(event);
  const database = databaseFor(event);
  const input = (await event.request.json()) as TeamInput;
  if (user.role !== 'admin') {
    const region = typeof input.regionId === 'string' && await database.one<{ id: string; organizationId: string }>(
      'SELECT id, organization_id AS organizationId FROM regions WHERE id = ?1', [input.regionId],
    );
    if (!region || !directsRegion(user, region)) throw error(403, 'Select a region you manage.');
  }
  try {
    const record = await new SqliteTeamRepository(database).create(input, user.id);
    return json({ ok: true, record }, { status: 201 });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
