import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';
import { SqliteSituationRepository } from '$lib/server/repositories/situations';
import { writeAudit } from '$lib/server/repositories/audit';

export const GET: RequestHandler = async event => {
  await requireUser(event, ['admin']);
  const db = databaseFor(event);
  // Read the revision before the list; membership changes then invalidate the save.
  const state = await db.one<{revision:number}>('SELECT revision FROM situation_library_state WHERE id = 1');
  return json({ revision: state?.revision, situations: await new SqliteSituationRepository(db).list() }, { headers: {'Cache-Control':'no-store'} });
};
export const PUT: RequestHandler = async event => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  const { keys, revision } = await event.request.json();
  if (!Array.isArray(keys) || keys.length > 1000 || keys.some(key => typeof key !== 'string') || new Set(keys).size !== keys.length || !Number.isInteger(revision)) return json({error:'Provide the complete ordered library and its revision.'},{status:400});
  const db = databaseFor(event);
  const before = await new SqliteSituationRepository(db).list();
  if (before.length !== keys.length || before.some(item => !keys.includes(item.key))) return json({error:'The library changed. Reload the order before saving.'},{status:409});
  const token = crypto.randomUUID();
  const [result] = await db.batch([
    {sql:'UPDATE situation_library_state SET revision = revision + 1, token = ?1 WHERE id = 1 AND revision = ?2',params:[token,revision]},
    {sql:`UPDATE situations SET library_order = (SELECT CAST(j.key AS INTEGER) FROM json_each(?1) j WHERE j.value = situations.key) WHERE active = 1 AND EXISTS(SELECT 1 FROM situation_library_state WHERE id = 1 AND token = ?2)`,params:[JSON.stringify(keys),token]},
  ]);
  if (!result.changes) return json({error:'The library order changed. Reload before saving.'},{status:409});
  await writeAudit(db,user.id,'reorder','situation-library','shared',before.map(item=>item.key),keys);
  return json({ok:true,revision:revision+1});
};
