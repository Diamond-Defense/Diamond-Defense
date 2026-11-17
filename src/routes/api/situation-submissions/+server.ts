import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
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
  await requireUser(event, ['coach']);
  return json({ error: 'Submit a published revision to its parent library in Design workspace.' }, { status: 410 });
};
