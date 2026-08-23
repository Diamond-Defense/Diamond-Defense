import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { expectedRevision } from '$lib/server/http/revisions';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteTeamRepository } from '$lib/server/repositories/teams';
import { assertSameOrigin, requireTeamManager } from '$lib/server/security/authorization';

export const prerender = false;

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireTeamManager(event, event.params.teamId);
  try {
    const repository = new SqliteTeamRepository(databaseFor(event));
    const existing = await repository.getMember(
      event.params.teamId,
      event.params.userId,
      true,
    );
    if (existing?.role === 'coach' && user.role !== 'admin') {
      return json(
        { error: 'Only an administrator can restore coach accounts.' },
        { status: 403 },
      );
    }
    const record = await repository.setMemberActive(
      event.params.teamId,
      event.params.userId,
      true,
      expectedRevision(event.request),
      user.id,
    );
    return json({ ok: true, record });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
