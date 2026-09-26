import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { requireUser, assertSameOrigin } from '$lib/server/security/authorization';
import { expectedRevision } from '$lib/server/http/revisions';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
export const GET: RequestHandler = async event => {
 await requireUser(event,['admin']);const db=databaseFor(event);const key=event.params.key;
 const situation=await db.one<{title:string;revision:number}>('SELECT title,revision FROM situations WHERE key=?1',[key]);
 if(!situation)return json({error:'Situation not found.'},{status:404});
 const counts:Record<string,number>={};
 for(const [label,table,column] of [['assignments','assignment_situations','situation_key'],['attempts','attempts','situation_key'],['revisions','situation_versions','situation_key'],['proposals','situation_submissions','situation_key'],['teamPlaybooks','team_playbook_situations','situation_key']])counts[label]=(await db.one<{count:number}>(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column}=?1`,[key]))?.count||0;
 return json({key,...situation,counts},{headers:{'Cache-Control':'no-store'}});
};
export const DELETE: RequestHandler = async event => {
 assertSameOrigin(event);const user=await requireUser(event,['admin']);const db=databaseFor(event);const key=event.params.key;
 try{
 const revision=expectedRevision(event.request);const body=await event.request.json();
 const record=await db.one<{title:string;revision:number;payload_json:string}>('SELECT title,revision,payload_json FROM situations WHERE key=?1',[key]);
 if(!record)return json({error:'Situation not found.'},{status:404});
 if(body.confirmation!==record.title)return json({error:'Type the situation name exactly to confirm deletion.'},{status:400});
 if(record.revision!==revision)return json({error:'Situation changed. Review deletion again.'},{status:409});
 if(await db.one('SELECT 1 FROM assignment_situations WHERE situation_key=?1 LIMIT 1',[key]))return json({error:'This situation is referenced by assignments. Remove those references or clear the affected practice data before deleting it.'},{status:409});
 const [removed]=await db.batch([
 {sql:'DELETE FROM situations WHERE key=?1 AND revision=?2',params:[key,revision]},
 {sql:'INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,created_at) SELECT ?1,?2,?3,?4,?5,?6,NULL,?7 WHERE changes()>0',params:[crypto.randomUUID(),user.id,'delete_permanently','situation',key,record.payload_json,new Date().toISOString()]},
 {sql:'DELETE FROM situation_submissions WHERE situation_key=?1 AND NOT EXISTS(SELECT 1 FROM situations WHERE key=?1)',params:[key]},
 {sql:'UPDATE situation_library_state SET revision=revision+1 WHERE id=1 AND NOT EXISTS(SELECT 1 FROM situations WHERE key=?1)',params:[key]}
 ]);
 if(!removed.changes)return json({error:'Situation changed. Review deletion again.'},{status:409});
 return json({ok:true});
 }catch(error){return repositoryErrorResponse(error);}
};
