import { currentUser } from '$lib/server/security/sessions';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Situation } from '$lib/domain/models';
import { databaseFor } from '$lib/server/database/context';
import { SqliteSituationRepository } from '$lib/server/repositories/situations';
import { assertSameOrigin, requireUser, requireSituationPublisher } from '$lib/server/security/authorization';
import { designWorkspaces } from '$lib/server/security/design-scopes';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const db=databaseFor(event);
  const user=await currentUser(db,event.cookies);
  const repository = new SqliteSituationRepository(db);
  const teamId = event.url.searchParams.get('teamId');
  if (teamId && user?.role !== 'player') {
    if (!user || user.mustChangePassword ||
      !(await designWorkspaces(db,user)).some(scope => scope.type === 'team' && scope.id === teamId)) {
      return json({error:'Choose a team you manage.'}, {status:403});
    }
  }
  const coachTeam = user?.role === 'coach' && event.url.searchParams.get('catalog') === 'playbook'
    ? user.coachedTeamIds?.find(id => id === user.teamId) || user.coachedTeamIds?.[0]
    : undefined;
  const catalogTeam = user?.role === 'player' ? user.teamId || '' : teamId || coachTeam;
  const situations = user?.role === 'player' || catalogTeam
    ? await repository.listTeamPlaybook(catalogTeam || '')
    : await repository.list();
  // Sorting metadata is attached only after the authorized catalog has been selected.
  if(event.url.searchParams.get('catalog')==='playbook'&&situations.length){
    const timestamps=await db.all<{key:string;createdAt:string;updatedAt:string}>(
      'SELECT key,created_at AS createdAt,updated_at AS updatedAt FROM situations WHERE key IN (SELECT value FROM json_each(?1))',
      [JSON.stringify(situations.map(situation=>situation.key))]);
    const byKey=new Map(timestamps.map(({key,...value})=>[key,value]));
    return json(situations.map(situation=>({...situation,...byKey.get(situation.key)})),{headers:{'Cache-Control':'private, no-store'}});
  }
  return json(situations,{headers:{'Cache-Control':'private, no-store'}});
};

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireSituationPublisher(event);
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
