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
    const user =
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

    if (!user) {
      return json({ error: 'Incorrect login information.' }, { status: 401 });
    }
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
      },
    });
  } catch (error) {
    console.error('Authentication failed unexpectedly.', error);
    return json(
      { error: 'Login service is temporarily unavailable. Please try again.' },
      { status: 503 },
    );
  }
};
