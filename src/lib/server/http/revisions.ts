import { PreconditionRequiredError } from '$lib/server/repositories/errors';

export function expectedRevision(request: Request): number {
  const raw = String(request.headers.get('if-match') || '').replaceAll('"', '').trim();
  const revision = Number(raw);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new PreconditionRequiredError(
      'An If-Match revision is required. Reload the record and try again.',
    );
  }
  return revision;
}
