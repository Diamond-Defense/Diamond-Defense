import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqliteAttemptRepository, type AttemptInput } from '$lib/server/repositories/attempts';
import { SqlitePracticeAssignmentRepository } from '$lib/server/repositories/practice-assignments';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['player']);
  if (!user.teamId) {
    return json({ error: 'Player is not assigned to a team.' }, { status: 400 });
  }
  const attempt = (await event.request.json()) as AttemptInput;
  if (!attempt.situationKey || (attempt.phase !== 1 && attempt.phase !== 2)) {
    return json({ error: 'A valid situation and phase are required.' }, { status: 400 });
  }
  if (
    attempt.outcome
    && !['passed', 'failed', 'abandoned'].includes(attempt.outcome)
  ) {
    return json({ error: 'A valid attempt outcome is required.' }, { status: 400 });
  }
  if (attempt.runId && String(attempt.runId).length > 100) {
    return json({ error: 'The attempt run ID is too long.' }, { status: 400 });
  }
  const database = databaseFor(event);
  const assignments = new SqlitePracticeAssignmentRepository(database);
  try {
    if (attempt.assignmentId) {
      await assignments.assertPlayerAccess(
        attempt.assignmentId,
        user.id,
        attempt.situationKey,
        attempt.situationRevision,
        attempt.runId,
      );
    } else {
      await assignments.assertFreePlayAccess(user.id, attempt.runId);
    }
  } catch (error) {
    return repositoryErrorResponse(error);
  }
  try {
    let practiceProgressed = false;
    const saved = await new SqliteAttemptRepository(database).save(
      user.id,
      user.teamId,
      attempt,
    );
    if (saved.changed && attempt.assignmentId) {
      const timestamp = attempt.completedAt || attempt.ts || attempt.startedAt || new Date().toISOString();
      await assignments.recordStart(
        attempt.assignmentId,
        user.id,
        attempt.situationKey,
        saved.id,
        attempt.startedAt || timestamp,
      );
      if (saved.lifecycleStatus === 'completed') {
        practiceProgressed = await assignments.recordAttempt(
          attempt.assignmentId,
          user.id,
          attempt.situationKey,
          saved.id,
          attempt.outcome === 'passed' || attempt.success === true,
          timestamp,
        );
      }
    }
    const practice = await assignments.playerState(user.id);
    return json(
      {
        ok: true,
        attemptId: saved.id,
        created: saved.created,
        changed: saved.changed,
        lifecycleStatus: saved.lifecycleStatus,
        practice,
        practiceProgressed,
      },
      { status: saved.created ? 201 : 200 },
    );
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
