export class RecordNotFoundError extends Error {}

export class RevisionConflictError extends Error {
  constructor(message = 'This record changed after it was loaded. Reload and try again.') {
    super(message);
  }
}

export class RecordValidationError extends Error {}

export class PreconditionRequiredError extends Error {}
