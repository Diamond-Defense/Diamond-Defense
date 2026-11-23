import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { requireUser } from '$lib/server/security/authorization';
import { designWorkspaces } from '$lib/server/security/design-scopes';

// Training membership is independent of the optional Situation Designer grant.
// Return scope metadata only; this endpoint grants no design actions.
export const GET: RequestHandler = async (event) => {
  const user = await requireUser(event, ['admin', 'coach']);
  const scopes = await designWorkspaces(databaseFor(event), user);
  return json({
    workspaces: scopes.map(({ type, id, name, parent }) => ({ type, id, name, parent })),
  }, { headers: { 'Cache-Control': 'no-store' } });
};
