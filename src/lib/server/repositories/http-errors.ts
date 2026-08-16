import { json } from '@sveltejs/kit';
import {
  PreconditionRequiredError,
  RecordNotFoundError,
  RecordValidationError,
  RevisionConflictError,
} from './errors';

export function repositoryErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof RecordNotFoundError) return json({ error: message }, { status: 404 });
  if (error instanceof RevisionConflictError) return json({ error: message }, { status: 409 });
  if (error instanceof RecordValidationError) return json({ error: message }, { status: 400 });
  if (error instanceof PreconditionRequiredError) return json({ error: message }, { status: 428 });
  console.error(error);
  return json({ error: 'Unable to complete the database operation.' }, { status: 500 });
}
