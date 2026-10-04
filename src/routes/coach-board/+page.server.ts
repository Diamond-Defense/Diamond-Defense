import { requireUser } from '$lib/server/security/authorization';
export const load = async (event) => {
  const user = await requireUser(event, ['coach','admin']);
  return {startInLibrary:event.url.searchParams.get('edit')!=='1', userId: user.id, role: user.role, canPublish: user.role === 'admin' || user.canPublishSituations};
};
