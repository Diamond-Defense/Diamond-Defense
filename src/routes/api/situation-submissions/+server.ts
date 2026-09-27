import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Situation } from '$lib/domain/models';
import { databaseFor } from '$lib/server/database/context';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteSituationSubmissionRepository } from '$lib/server/repositories/situation-submissions';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const user = await requireUser(event, ['coach', 'admin']);
  const repository = new SqliteSituationSubmissionRepository(databaseFor(event));
  const status = event.url.searchParams.get('status');
  const safeStatus =
    status === 'pending' ||
    status === 'approved' ||
    status === 'rejected' ||
    status === 'withdrawn'
      ? status
      : undefined;
  return json({
    submissions: await repository.list({
      submittedBy: user.role === 'coach' ? user.id : undefined,
      status: safeStatus,
    }),
  });
};

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['coach']);
  try {
    const body = (await event.request.json()) as
      | Situation
      | { situation?: Situation; rationale?: unknown };
    const wrapped = 'situation' in body && body.situation;
    const record = await new SqliteSituationSubmissionRepository(
      databaseFor(event),
    ).submit(
      (wrapped ? body.situation : body) as Situation,
      user.id,
      wrapped ? String(body.rationale || '') : 'Situation update submitted for review.',
    );
    return json({ ok: true, record }, { status: 201 });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
