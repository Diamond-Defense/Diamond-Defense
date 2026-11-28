import { error, redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/security/authorization';
import { databaseFor } from '$lib/server/database/context';
import { accessibleSituationRevision, designWorkspaces } from '$lib/server/security/design-scopes';
import { SqliteSituationRepository } from '$lib/server/repositories/situations';

export const load = async (event) => {
  const user = await requireUser(event, ['coach','admin']);
  if (!event.url.searchParams.has('design') && event.url.searchParams.get('edit') !== '1') throw redirect(307,'/?boardLibrary=1');
  const type = event.url.searchParams.get('design');
  const base = { userId: user.id, role: user.role, canPublish: user.role === 'admin', navigationUser: {id:user.id,displayName:user.displayName,role:user.role,canAccessDesign:user.canAccessDesign,directorScopes:user.directorScopes,coachedTeamIds:user.coachedTeamIds,teamId:user.teamId,mustChangePassword:user.mustChangePassword} };
  if (!type) return { ...base, startInLibrary: event.url.searchParams.get('edit') !== '1', designScope: null, initialSituation: null };
  const database = databaseFor(event);
  const id = event.url.searchParams.get('id') || '';
  const scope = (await designWorkspaces(database, user)).find(item => item.type === type && item.id === id);
  if (!scope?.canDesign) throw error(403, 'Designer access is required for this library.');
  const intent = event.url.searchParams.get('intent');
  const key = event.url.searchParams.get('key');
  if (intent === 'propose' || intent === 'variation') {
    const revision = Number(event.url.searchParams.get('revision'));
    const snapshot = key && Number.isInteger(revision) && await accessibleSituationRevision(database, scope, key, revision);
    if (!snapshot) throw error(404, 'Source revision is unavailable.');
    if (intent === 'propose' && revision !== snapshot.current_revision) throw error(409, 'This revision was updated at the source.');
    const original = { ...JSON.parse(snapshot.payload_json), key, revision };
    return { ...base, startInLibrary: false, canPublish: true, designScope: scope,
      initialSituation: intent === 'variation' ? {...original, title: original.title + ' — variation'} : original,
      designDraft: {intent, key, revision} };
  }
  const record = key && await database.one(
    'SELECT key FROM situations WHERE key=?1 AND library_scope=?2 AND library_id=?3 AND active=1', [key, type, id],
  );
  if (key && !record) throw error(404, 'Situation not found in this library.');
  return {
    ...base, startInLibrary: false, canPublish: true, designScope: scope,
    initialSituation: key ? await new SqliteSituationRepository(database).get(key) : null,
  };
};
