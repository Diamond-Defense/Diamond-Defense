import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSituationPublisher } from '$lib/server/security/authorization';
import { databaseFor } from '$lib/server/database/context';
export const GET: RequestHandler = async event => {
 await requireSituationPublisher(event);
 const teams=await databaseFor(event).all<{id:string;name:string}>('SELECT t.id,t.name FROM team_playbook_situations p JOIN teams t ON t.id=p.team_id WHERE p.situation_key=?1 AND t.active=1 ORDER BY t.name',[event.params.key]);
 return json({teams},{headers:{'Cache-Control':'no-store'}});
};
