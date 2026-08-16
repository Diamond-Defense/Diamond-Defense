import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { expectedRevision } from '$lib/server/http/revisions';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteTeamRepository, type MemberInput } from '$lib/server/repositories/teams';
import { assertSameOrigin, requireTeamManager } from '$lib/server/security/authorization';

export const prerender = false;

export const PUT: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireTeamManager(event, event.params.teamId);
  try {
    const record = await new SqliteTeamRepository(databaseFor(event)).updateMember(
      event.params.teamId,
      event.params.userId,
      (await event.request.json()) as Partial<MemberInput>,
      expectedRevision(event.request),
      user.id,
    );
    return json({ ok: true, record });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};

export const DELETE: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireTeamManager(event, event.params.teamId);
  try {
    const record = await new SqliteTeamRepository(databaseFor(event)).setMemberActive(
      event.params.teamId,
      event.params.userId,
      false,
      expectedRevision(event.request),
      user.id,
    );
    return json({ ok: true, record });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
