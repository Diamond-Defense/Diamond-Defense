import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteTeamRepository, type MemberInput } from '$lib/server/repositories/teams';
import { assertSameOrigin, requireTeamManager } from '$lib/server/security/authorization';

export const prerender = false;

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const input = (await event.request.json()) as MemberInput;
  const user = await requireTeamManager(event, event.params.teamId);
  if (input.role === 'coach' && user.role !== 'admin') {
    return json(
      { error: 'Only an administrator can create coach accounts.' },
      { status: 403 },
    );
  }
  try {
    const record = await new SqliteTeamRepository(databaseFor(event)).createMember(
      event.params.teamId,
      input,
      user.id,
    );
    return json({ ok: true, record }, { status: 201 });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
