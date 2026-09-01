import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteTeamRepository } from '$lib/server/repositories/teams';
import { assertSameOrigin, requireTeamManager } from '$lib/server/security/authorization';

export const prerender = false;

export const PUT: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireTeamManager(event, event.params.teamId);
  try {
    const body = (await event.request.json()) as { password?: string };
    const repository = new SqliteTeamRepository(databaseFor(event));
    const existing = await repository.getMember(
      event.params.teamId,
      event.params.userId,
      true,
    );
    if (existing?.role === 'coach' && user.role !== 'admin') {
      return json(
        { error: 'Only an administrator can reset coach passwords.' },
        { status: 403 },
      );
    }
    await repository.resetPassword(event.params.userId, body.password, user.id);
    return json({ ok: true, mustChangePassword: true });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
