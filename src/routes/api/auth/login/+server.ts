import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { SqliteAuthRepository } from '$lib/server/repositories/auth';
import { createSession } from '$lib/server/security/sessions';
import { assertSameOrigin } from '$lib/server/security/authorization';

export const prerender = false;

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const body = (await event.request.json()) as Record<string, unknown>;
  const role = String(body.role || 'player');
  const password = String(body.password || '');
  if (!password) return json({ error: 'Password is required.' }, { status: 400 });

  try {
    const database = databaseFor(event);
    const repository = new SqliteAuthRepository(database);
    const authentication =
      role === 'player'
        ? await repository.authenticatePlayer(
            String(body.teamId || ''),
            String(body.playerId || ''),
            password,
          )
        : role === 'coach'
          ? await repository.authenticateCoach(
              String(body.teamId || ''),
              String(body.coachId || ''),
              password,
            )
          : role === 'admin'
            ? await repository.authenticateStaff('admin', password)
            : null;

    if (!authentication || authentication.status === 'invalid') {
      return json(
        { code: 'INVALID_LOGIN', error: 'The selected account or password is incorrect.' },
        { status: 401 },
      );
    }
    if (authentication.status === 'locked') {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((new Date(authentication.lockedUntil).getTime() - Date.now()) / 1000),
      );
      return json(
        {
          code: 'ACCOUNT_TEMPORARILY_LOCKED',
          error: 'Too many unsuccessful login attempts. Try again in 15 minutes.',
          retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      );
    }
    const user = authentication.user;
    await createSession(database, event.cookies, user.id, event.url.protocol === 'https:');
    return json({
      user: {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        teamId: user.teamId,
        teamName: user.teamName,
        coachEmail: user.coachEmail,
        jerseyNumber: user.jerseyNumber,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    console.error('Authentication failed unexpectedly.', error);
    return json(
      {
        code: 'LOGIN_SERVICE_UNAVAILABLE',
        error: 'The login service cannot reach account data right now. Please try again shortly.',
      },
      { status: 503 },
    );
  }
};
