import { currentUser } from '$lib/server/security/sessions';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Situation } from '$lib/domain/models';
import { databaseFor } from '$lib/server/database/context';
import { SqliteSituationRepository } from '$lib/server/repositories/situations';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const db=databaseFor(event);
  const user=await currentUser(db,event.cookies);
  let situations = await new SqliteSituationRepository(db).list();
  if(user?.role==='player'){
    const selected=await db.all<{situation_key:string}>('SELECT situation_key FROM team_playbook_situations WHERE team_id=?1',[user.teamId]);
    situations=situations.filter(item=>selected.some(row=>row.situation_key===item.key));
  }
  return json(situations,{headers:{'Cache-Control':'private, no-store'}});
};

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
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
