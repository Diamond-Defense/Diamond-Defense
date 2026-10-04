import {error,json} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {databaseFor} from '$lib/server/database/context';
import {requireUser,assertSameOrigin} from '$lib/server/security/authorization';
import {SqliteSituationRepository} from '$lib/server/repositories/situations';
import {expectedRevision} from '$lib/server/http/revisions';
import {repositoryErrorResponse} from '$lib/server/repositories/http-errors';
export const GET:RequestHandler=async event=>{
 const user=await requireUser(event,['coach','admin']);const db=databaseFor(event);
 if(event.params.type==='situation'){
  const record=await new SqliteSituationRepository(db).get(event.params.id);if(!record)throw error(404,'Situation is unavailable.');
  return json(record,{headers:{'Cache-Control':'private, no-store'}});
 }
 if(event.params.type!=='board')throw error(404,'Unknown content type.');
 const row=await db.one<{payload_json:string;revision:number}>('SELECT payload_json,revision FROM coach_boards WHERE id=?1 AND owner_id=?2',[event.params.id,user.id]);
 if(!row)throw error(404,'Board is unavailable.');
 return json({id:event.params.id,revision:row.revision,board:JSON.parse(row.payload_json)},{headers:{'Cache-Control':'private, no-store'}});
};
export const DELETE:RequestHandler=async event=>{
 assertSameOrigin(event);const user=await requireUser(event,['coach','admin']);
 if(event.params.type!=='board')throw error(404,'Unknown content type.');
 try{
 const result=await databaseFor(event).execute('DELETE FROM coach_boards WHERE id=?1 AND owner_id=?2 AND revision=?3',[event.params.id,user.id,expectedRevision(event.request)]);
 if(!result.changes)return json({error:'Board changed or is unavailable. Reload the library before deleting.'},{status:409});
 return json({ok:true});
 }catch(e){return repositoryErrorResponse(e);}
};
