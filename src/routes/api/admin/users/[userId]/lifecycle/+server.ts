import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';
import { SqliteTeamRepository } from '$lib/server/repositories/teams';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { writeAudit } from '$lib/server/repositories/audit';
export const prerender=false;
export const POST:RequestHandler=async(event)=>{
  assertSameOrigin(event);const actor=await requireUser(event,['admin']);const database=databaseFor(event);
  const body=await event.request.json() as {action?:string;name?:string;password?:string;revision?:number};
  const account=await database.one<{id:string;role:string;active:number;revision:number;display_name:string}>('SELECT id,role,active,revision,display_name FROM users WHERE id=?1',[event.params.userId]);
  if(!account||!['player','coach'].includes(account.role))return json({error:'Account not found.'},{status:404});
  if(body.revision!==account.revision)return json({error:'Account changed. Refresh People before trying again.'},{status:409});
  try{
    const repository=new SqliteTeamRepository(database);const now=new Date().toISOString();
    if(body.action==='archive'){
      const memberships=await database.all<{teamId:string;revision:number}>('SELECT team_id AS teamId,revision FROM team_memberships WHERE user_id=?1 AND active=1',[account.id]);
      if(account.role==='coach'){
        const owned=await database.one<{total:number}>('SELECT COUNT(*) AS total FROM practice_assignments WHERE coach_id=?1',[account.id]);
        const appointed=await database.one<{total:number}>('SELECT COUNT(*) AS total FROM workspace_assignments WHERE user_id=?1',[account.id]);
        if(Number(owned?.total)||Number(appointed?.total))return json({error:'Remove staff assignments and reassign owned practices before archiving this staff account.'},{status:409});
      }
      for(const membership of memberships)await repository.setMemberActive(membership.teamId,account.id,false,membership.revision,actor.id);
      const archived=await database.execute('UPDATE users SET active=0,archived_at=?2,archived_by=?3,updated_at=?2,revision=revision+1 WHERE id=?1 AND revision=?4',[account.id,now,actor.id,account.revision]);
      if(!archived.changes)return json({error:'Account changed during archiving. Refresh People and review its current memberships.'},{status:409});
      await database.execute('DELETE FROM sessions WHERE user_id=?1',[account.id]);
    }else if(body.action==='restore'){
      const current=await database.one<{total:number}>('SELECT COUNT(*) AS total FROM team_memberships WHERE user_id=?1 AND active=1',[account.id]);
      if(Number(current?.total))return json({error:'This archived account has active memberships. Resolve them before restoring.'},{status:409});
      const restored=await database.execute('UPDATE users SET active=1,archived_at=NULL,archived_by=NULL,updated_at=?2,revision=revision+1 WHERE id=?1 AND revision=?3',[account.id,now,account.revision]);
      if(!restored.changes)return json({error:'Account changed. Refresh People before restoring.'},{status:409});
    }else if(body.action==='details'){
      const name=String(body.name||'').trim();if(!name||name.length>100)return json({error:'Enter a name of up to 100 characters.'},{status:400});
      await database.execute('UPDATE users SET display_name=?2,revision=revision+1,updated_at=?3 WHERE id=?1 AND revision=?4',[account.id,name,now,account.revision]);
    }else if(body.action==='password'){
      await repository.resetPassword(account.id,String(body.password||''),actor.id);
    }else return json({error:'Unknown account action.'},{status:400});
    await writeAudit(database,actor.id,body.action,'user',account.id,{active:account.active},{action:body.action});
    return json({ok:true});
  }catch(error){return repositoryErrorResponse(error);}
};
