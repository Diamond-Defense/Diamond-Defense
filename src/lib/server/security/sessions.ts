import type { Cookies } from '@sveltejs/kit';
import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';

export const SESSION_COOKIE = 'diamond_defense_session';

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  role: 'player' | 'coach' | 'admin';
  teamId: string | null;
}

interface SessionRow {
  id: string;
  username: string;
  display_name: string;
  role: AuthenticatedUser['role'];
  team_id: string | null;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function tokenHash(token: string): Promise<string> {
  return bytesToBase64Url(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    ),
  );
}

export async function createSession(
  database: SqliteDatabaseAdapter,
  cookies: Cookies,
  userId: string,
  secure: boolean,
): Promise<void> {
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  await database.execute('DELETE FROM sessions WHERE expires_at <= ?1', [
    now.toISOString(),
  ]);
  await database.execute(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)',
    [await tokenHash(token), userId, expires.toISOString(), now.toISOString()],
  );
  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60,
  });
}

export async function destroySession(
  database: SqliteDatabaseAdapter,
  cookies: Cookies,
): Promise<void> {
  const token = cookies.get(SESSION_COOKIE);
  if (token) {
    await database.execute('DELETE FROM sessions WHERE token_hash = ?1', [
      await tokenHash(token),
    ]);
  }
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function currentUser(
  database: SqliteDatabaseAdapter,
  cookies: Cookies,
): Promise<AuthenticatedUser | null> {
  const token = cookies.get(SESSION_COOKIE);
  if (!token) return null;
  const row = await database.one<SessionRow>(
    `SELECT u.id, u.username, u.display_name, u.role, tm.team_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN team_memberships tm ON tm.user_id = u.id AND tm.active = 1
      WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND u.active = 1
      ORDER BY tm.team_id
      LIMIT 1`,
    [await tokenHash(token), new Date().toISOString()],
  );
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    teamId: row.team_id,
  };
}
