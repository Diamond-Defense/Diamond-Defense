import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteSituationSubmissionRepository } from '$lib/server/repositories/situation-submissions';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const PUT: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  const body = (await event.request.json()) as Record<string, unknown>;
  const decision = body.decision;
  if (decision !== 'approve' && decision !== 'reject') {
    return json(
      { error: 'Decision must be approve or reject.' },
      { status: 400 },
    );
  }
  try {
    const result = await new SqliteSituationSubmissionRepository(
      databaseFor(event),
    ).review(
      event.params.id,
      decision,
      String(body.notes || ''),
      user.id,
    );
    return json({ ok: true, ...result });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
