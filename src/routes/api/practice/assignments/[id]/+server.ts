import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqlitePracticeAssignmentRepository } from '$lib/server/repositories/practice-assignments';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { assertSameOrigin, requireTeamManager, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const user = await requireUser(event, ['player', 'coach', 'admin']);
  const repository = new SqlitePracticeAssignmentRepository(databaseFor(event));
  const assignment = await repository.get(
    event.params.id,
    user.role === 'player' ? user.id : undefined,
  );
  if (!assignment) return json({ error: 'Assignment not found.' }, { status: 404 });
  if (user.role === 'player') {
    const allowed = assignment.recipients.some((recipient) => recipient.playerId === user.id)
      && ['active', 'completed'].includes(assignment.status)
      && !assignment.closedAt && !assignment.cancelledAt;
    if (!allowed) return json({ error: 'Assignment not found.' }, { status: 404 });
  } else {
    await requireTeamManager(event, assignment.teamId);
  }
  return json({ assignment }, { headers: { 'Cache-Control': 'private, no-store' } });
};

export const PATCH: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['coach', 'admin']);
  const repository = new SqlitePracticeAssignmentRepository(databaseFor(event));
  const existing = await repository.get(event.params.id);
  if (!existing) return json({ error: 'Assignment not found.' }, { status: 404 });
  await requireTeamManager(event, existing.teamId);
  const body = (await event.request.json()) as { action?: string };
  try {
    const assignment = body.action === 'publish'
      ? await repository.publish(existing.id, existing.teamId, user.id)
      : body.action === 'archive'
        ? await repository.archive(existing.id, existing.teamId, user.id)
        : body.action === 'close' || body.action === 'cancel'
          ? await repository.end(existing.id, existing.teamId, user.id, body.action)
        : null;
    if (!assignment) return json({ error: 'A valid assignment action is required.' }, { status: 400 });
    return json({ ok: true, assignment });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
