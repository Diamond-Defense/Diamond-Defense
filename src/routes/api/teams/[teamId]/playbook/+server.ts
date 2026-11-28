import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { assertSameOrigin, requireTrainingManager } from '$lib/server/security/authorization';
import { SqliteSituationRepository } from '$lib/server/repositories/situations';
export const GET: RequestHandler = async event => {
 await requireTrainingManager(event,event.params.teamId);
 const db=databaseFor(event);
 const state=await db.one<{revision:number}>('SELECT revision FROM team_playbook_state WHERE team_id=?1',[event.params.teamId]);
 if(!state)return json({error:'Team not found.'},{status:404});
 const rows=await db.all<{situation_key:string}>('SELECT situation_key FROM effective_team_playbook WHERE team_id=?1',[event.params.teamId]);
 const withSituations = event.url.searchParams.get('includeSituations') === 'true';
 const situations = withSituations ? await new SqliteSituationRepository(db).listTeamPlaybook(event.params.teamId) : undefined;
 return json({revision:state.revision,keys:rows.map(row=>row.situation_key),situations},{headers:{'Cache-Control':'no-store'}});
};
export const PUT: RequestHandler = async event => {
 assertSameOrigin(event);
 await requireTrainingManager(event,event.params.teamId);
 return json({error:'Manage inherited situations with Hide and Show in the Team Situation Library.'},{status:410});
};
