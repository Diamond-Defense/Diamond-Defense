import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';
import { SqliteTeamRepository } from '$lib/server/repositories/teams';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
export const prerender=false;
export const POST:RequestHandler=async(event)=>{
  assertSameOrigin(event);const actor=await requireUser(event,['admin']);const database=databaseFor(event);
  const body=await event.request.json() as {userId?:string;action?:string};
  if(body.action!=='undo'||!body.userId)return json({error:'Choose a member to undo.'},{status:400});
  const season=await database.one<{status:string}>('SELECT status FROM team_seasons WHERE id=?1 AND team_id=?2',[event.params.seasonId,event.params.teamId]);
  if(season?.status!=='active')return json({error:'Only an active season entry can be undone.'},{status:409});
  const activity=await database.one<{total:number}>(`SELECT (SELECT COUNT(*) FROM attempts WHERE season_id=?1 AND player_id=?2)+(SELECT COUNT(*) FROM assignment_recipients ar JOIN practice_assignments pa ON pa.id=ar.assignment_id WHERE pa.season_id=?1 AND ar.player_id=?2) +(SELECT COUNT(*) FROM practice_assignments WHERE season_id=?1 AND coach_id=?2) AS total`,[event.params.seasonId,body.userId]);
  if(Number(activity?.total))return json({error:'This member has season activity. End participation instead; their history must be retained.'},{status:409});
  try{
    const repository=new SqliteTeamRepository(database);const member=await repository.getMember(event.params.teamId,body.userId,true);
    if(!member||!member.active||member.seasonId!==event.params.seasonId)return json({error:'Current season membership not found.'},{status:404});
    await repository.setMemberActive(event.params.teamId,body.userId,false,member.revision,actor.id);
    const removed=await database.execute(`DELETE FROM season_memberships WHERE season_id=?1 AND user_id=?2 AND NOT EXISTS (SELECT 1 FROM attempts WHERE season_id=?1 AND player_id=?2) AND NOT EXISTS (SELECT 1 FROM assignment_recipients ar JOIN practice_assignments pa ON pa.id=ar.assignment_id WHERE pa.season_id=?1 AND ar.player_id=?2) AND NOT EXISTS (SELECT 1 FROM practice_assignments WHERE season_id=?1 AND coach_id=?2)`,[event.params.seasonId,body.userId]);
    if(!removed.changes)return json({error:'Participation ended, but the season entry was retained because activity changed. Refresh the season.'},{status:409});
    return json({ok:true});
  }catch(error){return repositoryErrorResponse(error);}
};
