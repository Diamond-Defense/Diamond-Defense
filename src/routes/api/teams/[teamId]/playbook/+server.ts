import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { assertSameOrigin, requireTeamManager } from '$lib/server/security/authorization';
import { writeAudit } from '$lib/server/repositories/audit';
export const GET: RequestHandler = async event => {
 await requireTeamManager(event,event.params.teamId);
 const db=databaseFor(event);
 const state=await db.one<{revision:number}>('SELECT revision FROM team_playbook_state WHERE team_id=?1',[event.params.teamId]);
 if(!state)return json({error:'Team not found.'},{status:404});
 const rows=await db.all<{situation_key:string}>('SELECT situation_key FROM team_playbook_situations WHERE team_id=?1',[event.params.teamId]);
 return json({revision:state.revision,keys:rows.map(row=>row.situation_key)},{headers:{'Cache-Control':'no-store'}});
};
export const PUT: RequestHandler = async event => {
 assertSameOrigin(event);
 const user=await requireTeamManager(event,event.params.teamId);
 const {keys,revision}=await event.request.json();
 if(!Array.isArray(keys)||keys.length>1000||keys.some(key=>typeof key!=='string')||new Set(keys).size!==keys.length||!Number.isInteger(revision))return json({error:'Provide selected situations and the current revision.'},{status:400});
 const db=databaseFor(event);
 const active=await db.all<{key:string}>('SELECT key FROM situations WHERE active=1');
 if(keys.some(key=>!active.some(item=>item.key===key)))return json({error:'Some situations are no longer published. Reload the library.'},{status:409});
 const before=await db.all('SELECT situation_key FROM team_playbook_situations WHERE team_id=?1',[event.params.teamId]);
 // D1 batches are transactional. A stale revision makes both selection writes no-ops.
 const token=crypto.randomUUID();
 const [result]=await db.batch([
 {sql:'UPDATE team_playbook_state SET revision=revision+1, token=?3 WHERE team_id=?1 AND revision=?2',params:[event.params.teamId,revision,token]},
 {sql:'DELETE FROM team_playbook_situations WHERE team_id=?1 AND EXISTS(SELECT 1 FROM team_playbook_state WHERE team_id=?1 AND token=?2)',params:[event.params.teamId,token]},
 {sql:`INSERT INTO team_playbook_situations(team_id,situation_key) SELECT ?1,value FROM json_each(?2) WHERE (SELECT token FROM team_playbook_state WHERE team_id=?1)=?3 ON CONFLICT DO NOTHING`,params:[event.params.teamId,JSON.stringify(keys),token]}
 ]);
 if(!result.changes)return json({error:'Team Playbook changed. Reload before saving.'},{status:409});
 await writeAudit(db,user.id,'update','team-playbook',event.params.teamId,before,keys);
 return json({ok:true,revision:revision+1});
};
