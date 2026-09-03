import type { Cookies } from '@sveltejs/kit';
import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';

export const SESSION_COOKIE = 'diamond_defense_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_IDLE_TIMEOUT_SECONDS = 12 * 60 * 60;
const SESSION_TOUCH_INTERVAL_SECONDS = 5 * 60;

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  role: 'player' | 'coach' | 'admin';
  teamId: string | null;
  teamName: string | null;
  jerseyNumber: string | null;
  mustChangePassword: boolean;
}

interface SessionRow {
  id: string;
  username: string;
  display_name: string;
  role: AuthenticatedUser['role'];
  team_id: string | null;
  team_name: string | null;
  season_name: string | null;
  jersey_number: string | null;
  must_change_password: number;
  last_seen_at: string;
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
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  await database.execute('DELETE FROM sessions WHERE expires_at <= ?1', [
    now.toISOString(),
  ]);
  await database.execute(
    `INSERT INTO sessions
      (token_hash, user_id, expires_at, created_at, last_seen_at)
     VALUES (?1, ?2, ?3, ?4, ?4)`,
    [await tokenHash(token), userId, expires.toISOString(), now.toISOString()],
  );
  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroyAllSessions(
  database: SqliteDatabaseAdapter,
  cookies: Cookies,
  userId: string,
): Promise<void> {
  await database.execute('DELETE FROM sessions WHERE user_id = ?1', [userId]);
  cookies.delete(SESSION_COOKIE, { path: '/' });
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
  const now = new Date();
  const idleCutoff = new Date(
    now.getTime() - SESSION_IDLE_TIMEOUT_SECONDS * 1000,
  ).toISOString();
  const hash = await tokenHash(token);
  const row = await database.one<SessionRow>(
    `SELECT u.id, u.username, u.display_name, u.role, tm.team_id,
            t.name AS team_name, ts.name AS season_name, tm.jersey_number,
            u.must_change_password,
            s.last_seen_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN team_memberships tm ON tm.user_id = u.id AND tm.active = 1
       LEFT JOIN teams t ON t.id = tm.team_id AND t.active = 1
       LEFT JOIN team_seasons ts ON ts.id = tm.season_id AND ts.status = 'active'
      WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND s.last_seen_at > ?3
        AND u.active = 1
      ORDER BY tm.team_id
      LIMIT 1`,
    [hash, now.toISOString(), idleCutoff],
  );
  if (!row) {
    await database.execute('DELETE FROM sessions WHERE token_hash = ?1', [hash]);
    cookies.delete(SESSION_COOKIE, { path: '/' });
    return null;
  }
  const lastSeen = new Date(row.last_seen_at).getTime();
  if (!Number.isFinite(lastSeen) || now.getTime() - lastSeen >= SESSION_TOUCH_INTERVAL_SECONDS * 1000) {
    await database.execute('UPDATE sessions SET last_seen_at = ?2 WHERE token_hash = ?1', [
      hash,
      now.toISOString(),
    ]);
  }
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    teamId: row.team_id,
    teamName: row.team_name && row.season_name
      ? row.season_name.toLocaleLowerCase().startsWith(`${row.team_name.toLocaleLowerCase()} —`)
        ? row.season_name
        : `${row.team_name} — ${row.season_name}`
      : row.team_name,
    jerseyNumber: row.jersey_number,
    mustChangePassword: Boolean(row.must_change_password),
  };
}
