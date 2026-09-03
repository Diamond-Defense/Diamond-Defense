import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import {
  SqlitePracticeAssignmentRepository,
  type PracticeAssignmentUpdateInput,
} from '$lib/server/repositories/practice-assignments';
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
    let assignment = null;
    if (body.action === 'publish') assignment = await repository.publish(existing.id, existing.teamId, user.id);
    else if (body.action === 'archive') assignment = await repository.archive(existing.id, existing.teamId, user.id);
    else if (body.action === 'restore') assignment = await repository.restore(existing.id, existing.teamId, user.id);
    else if (body.action === 'duplicate' || body.action === 'retake') {
      assignment = await repository.duplicate(existing.id, existing.teamId, user.id, body.action === 'retake');
    } else if (body.action === 'close' || body.action === 'cancel') {
      assignment = await repository.end(existing.id, existing.teamId, user.id, body.action);
    }
    if (!assignment) return json({ error: 'A valid assignment action is required.' }, { status: 400 });
    return json({ ok: true, assignment });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};

export const PUT: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['coach', 'admin']);
  const repository = new SqlitePracticeAssignmentRepository(databaseFor(event));
  const existing = await repository.get(event.params.id);
  if (!existing) return json({ error: 'Assignment not found.' }, { status: 404 });
  await requireTeamManager(event, existing.teamId);
  try {
    const body = (await event.request.json()) as PracticeAssignmentUpdateInput;
    const assignment = await repository.update(existing.id, existing.teamId, user.id, body);
    return json({ ok: true, assignment });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};

export const DELETE: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['coach', 'admin']);
  const repository = new SqlitePracticeAssignmentRepository(databaseFor(event));
  const existing = await repository.get(event.params.id);
  if (!existing) return json({ error: 'Assignment not found.' }, { status: 404 });
  await requireTeamManager(event, existing.teamId);
  try {
    await repository.deleteUnusedDraft(existing.id, existing.teamId, user.id);
    return json({ ok: true });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
