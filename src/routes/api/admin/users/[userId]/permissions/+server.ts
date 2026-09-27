import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';
export const GET: RequestHandler = async event => {
 await requireUser(event,['admin']); const db=databaseFor(event);
 const user=await db.one("SELECT id FROM users WHERE id=?1 AND role='coach' AND active=1",[event.params.userId]);
 if(!user)return json({error:'Active coach not found.'},{status:404});
 const teams=await db.all<{team_id:string}>('SELECT team_id FROM coach_team_access WHERE user_id=?1',[event.params.userId]);
 const permissions=await db.one<{publish_situations:number}>('SELECT publish_situations FROM coach_permissions WHERE user_id=?1',[event.params.userId]);
 return json({teamIds:teams.map(t=>t.team_id),canPublishSituations:Boolean(permissions?.publish_situations)},{headers:{'Cache-Control':'no-store'}});
};
export const PUT: RequestHandler = async event => {
 assertSameOrigin(event); const actor=await requireUser(event,['admin']); const db=databaseFor(event);
 const body=await event.request.json();
 if(!Array.isArray(body.teamIds)||body.teamIds.length>100||body.teamIds.some((id:unknown)=>typeof id!=='string')||typeof body.canPublishSituations!=='boolean')return json({error:'Choose valid team access and publishing permission.'},{status:400});
 if(!await db.one("SELECT id FROM users WHERE id=?1 AND role='coach' AND active=1",[event.params.userId]))return json({error:'Active coach not found.'},{status:404});
 const ids=[...new Set<string>(body.teamIds)];
 for(const id of ids)if(!await db.one('SELECT id FROM teams WHERE id=?1 AND active=1',[id]))return json({error:'Selected team is not active.'},{status:400});
 await db.batch([
 {sql:'DELETE FROM coach_team_access WHERE user_id=?1',params:[event.params.userId]},
 ...ids.map(id=>({sql:'INSERT INTO coach_team_access(user_id,team_id) VALUES(?1,?2)',params:[event.params.userId,id]})),
 {sql:'INSERT INTO coach_permissions(user_id,publish_situations) VALUES(?1,?2) ON CONFLICT(user_id) DO UPDATE SET publish_situations=excluded.publish_situations',params:[event.params.userId,Number(body.canPublishSituations)]},
 {sql:'INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,after_json,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)',params:[crypto.randomUUID(),actor.id,'update_permissions','user',event.params.userId,JSON.stringify({teamIds:ids,canPublishSituations:body.canPublishSituations}),new Date().toISOString()]}
 ]);return json({ok:true});
};
