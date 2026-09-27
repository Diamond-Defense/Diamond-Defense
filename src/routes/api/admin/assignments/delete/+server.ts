import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';

export const POST: RequestHandler = async event => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  try {
    const body = await event.request.json();
    if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 100 || body.ids.some((id: unknown) => typeof id !== 'string' || !id))
      return json({ error: 'Select between 1 and 100 assignments.' }, { status: 400 });
    const ids = [...new Set<string>(body.ids)];
    if (body.confirmation !== 'DELETE') return json({ error: 'Confirm permanent deletion.' }, { status: 400 });
    const db = databaseFor(event);
    const slots = ids.map((_, i) => `?${i + 1}`).join(',');
    const eligible = "(status='archived' OR cancelled_at IS NOT NULL)";
    const records = await db.all<{id:string;title:string}>(`SELECT id,title FROM practice_assignments WHERE id IN (${slots}) AND ${eligible}`, ids);
    if (records.length !== ids.length) return json({ error: 'Only canceled or archived assignments can be deleted. Refresh the list and try again.' }, { status: 409 });
    // One guarded delete keeps a changed selection from being partially removed.
    const [removed] = await db.batch([
      { sql: `DELETE FROM practice_assignments WHERE id IN (${slots}) AND (SELECT COUNT(*) FROM practice_assignments WHERE id IN (${slots}) AND ${eligible})=${ids.length}`, params: ids },
      { sql: 'INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,created_at) SELECT ?1,?2,?3,?4,?5,?6,NULL,?7 WHERE changes()>0', params: [crypto.randomUUID(),user.id,'delete_permanently','assignments',ids.join(','),JSON.stringify(records),new Date().toISOString()] },
    ]);
    if (removed.changes !== ids.length) return json({ error: 'Assignments changed. Refresh the list and try again.' }, { status: 409 });
    return json({ ok: true, deleted: removed.changes });
  } catch(error) { return repositoryErrorResponse(error); }
};
