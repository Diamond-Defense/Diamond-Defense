import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';
import { compilePlay } from '$lib/plays/animation.js';
import { validateBoard } from '$lib/plays/board.js';

export const GET: RequestHandler = async event => {
  const user = await requireUser(event, ['coach', 'admin']);
  const rows = await databaseFor(event).all<{id:string;payload_json:string;revision:number;updated_at:string}>(
    'SELECT id, payload_json, revision, updated_at FROM coach_boards WHERE owner_id=?1 ORDER BY updated_at DESC', [user.id]);
  return json(rows.map(row => ({ id:row.id, board:JSON.parse(row.payload_json), revision:row.revision, updatedAt:row.updated_at })), {headers:{'Cache-Control':'private, no-store'}});
};
export const POST: RequestHandler = async event => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['coach', 'admin']);
  const raw = await event.request.text();
  if (raw.length > 1000000) return json({error:'Board is too large.'},{status:413});
  let input;
  try { input=JSON.parse(raw); } catch {return json({error:'Invalid JSON.'},{status:400});}
  if (input?.id && (typeof input.id !== 'string' || !Number.isSafeInteger(input.revision) || input.revision < 1)) return json({error:'A valid Board ID and revision are required.'},{status:400});
  const issues=validateBoard(input?.board);
  if(issues.length) return json({error:issues.join('\n')},{status:400});
  try { compilePlay(input.board,{coachBoard:true}); } catch(error) { return json({error:error instanceof Error ? error.message : 'Invalid animation events.'},{status:400}); }
  const db=databaseFor(event);
  const id=input.id || crypto.randomUUID();
  // Keep the uniqueness check in the write statement so concurrent saves cannot
  // both create the same owner/name pair. Existing duplicates are retained.
  const duplicateError='You already have a Board with this name. Choose another name or load the existing Board to update it.';
  if(input.id){
    const result=await db.execute(`UPDATE coach_boards SET title=?1,payload_json=?2,revision=revision+1,updated_at=CURRENT_TIMESTAMP
      WHERE id=?3 AND owner_id=?4 AND revision=?5
      AND (lower(trim(title))=lower(trim(?1)) OR NOT EXISTS
        (SELECT 1 FROM coach_boards other WHERE other.owner_id=?4 AND other.id<>?3 AND lower(trim(other.title))=lower(trim(?1))))`, [input.board.title,JSON.stringify(input.board),id,user.id,input.revision]);
    if(!result.changes){
      const current=await db.one<{revision:number}>('SELECT revision FROM coach_boards WHERE id=?1 AND owner_id=?2',[id,user.id]);
      return json({error:current?.revision===input.revision?duplicateError:'Board changed or is unavailable. Reload it before saving.'},{status:409});
    }
  }else {
    const result=await db.execute(`INSERT INTO coach_boards (id,owner_id,title,payload_json)
      SELECT ?1,?2,?3,?4 WHERE NOT EXISTS
        (SELECT 1 FROM coach_boards WHERE owner_id=?2 AND lower(trim(title))=lower(trim(?3)))`,[id,user.id,input.board.title,JSON.stringify(input.board)]);
    if(!result.changes)return json({error:duplicateError},{status:409});
  }
  return json({id,revision:input.id?input.revision+1:1},{status:input.id?200:201});
};
