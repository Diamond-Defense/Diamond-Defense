import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { writeAudit } from '$lib/server/repositories/audit';
import { SqliteAuthRepository } from '$lib/server/repositories/auth';
import { RecordValidationError } from '$lib/server/repositories/errors';
import { assertSameOrigin } from '$lib/server/security/authorization';
import { createSession, currentUser } from '$lib/server/security/sessions';

export const prerender = false;

export const PUT: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const database = databaseFor(event);
  const user = await currentUser(database, event.cookies);
  if (!user) {
    return json({ code: 'LOGIN_REQUIRED', error: 'Log in before changing your password.' }, { status: 401 });
  }
  try {
    const body = (await event.request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };
    const repository = new SqliteAuthRepository(database);
    const changed = await repository.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
    );
    if (!changed) {
      return json(
        { code: 'CURRENT_PASSWORD_INCORRECT', error: 'Your current password is incorrect.' },
        { status: 401 },
      );
    }
    await writeAudit(database, user.id, 'password_change', 'user', user.id, null, {
      changed: true,
    });
    await createSession(database, event.cookies, user.id, event.url.protocol === 'https:');
    return json({
      ok: true,
      user: { ...user, mustChangePassword: false },
      message: 'Password changed. Other signed-in devices were logged out.',
    });
  } catch (error) {
    if (error instanceof RecordValidationError) {
      return json({ code: 'PASSWORD_INVALID', error: error.message }, { status: 400 });
    }
    console.error('Password change failed unexpectedly.', error);
    return json(
      { code: 'PASSWORD_SERVICE_UNAVAILABLE', error: 'Your password could not be changed right now. Please try again.' },
      { status: 503 },
    );
  }
};
