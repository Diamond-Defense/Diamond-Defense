import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';
import {
  createPasswordHash,
  validateAccountPassword,
  verifyPassword,
} from '$lib/server/security/passwords';
import { RecordValidationError } from './errors';

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const ACCOUNT_LOCK_MINUTES = 15;

interface LoginRow {
  id: string;
  username: string;
  display_name: string;
  role: 'player' | 'coach' | 'admin';
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  team_id: string | null;
  team_name: string | null;
  season_name: string | null;
  jersey_number: string | null;
  must_change_password: number;
  failed_login_attempts: number;
  locked_until: string | null;
}

export interface LoginResult {
  id: string;
  username: string;
  displayName: string;
  role: LoginRow['role'];
  teamId: string | null;
  teamName: string | null;
  jerseyNumber: string | null;
  mustChangePassword: boolean;
}

export type AuthenticationResult =
  | { status: 'success'; user: LoginResult }
  | { status: 'invalid' }
  | { status: 'locked'; lockedUntil: string };

export class SqliteAuthRepository {
  constructor(private readonly database: SqliteDatabaseAdapter) {}

  async authenticatePlayer(
    teamId: string,
    playerId: string,
    password: string,
  ): Promise<AuthenticationResult> {
    const row = await this.database.one<LoginRow>(
      `SELECT u.id, u.username, u.display_name, u.role,
              u.password_hash, u.password_salt, u.password_iterations,
              u.must_change_password, u.failed_login_attempts, u.locked_until,
              t.id AS team_id, t.name AS team_name, ts.name AS season_name,
              tm.jersey_number
         FROM users u
         JOIN team_memberships tm ON tm.user_id = u.id AND tm.team_role = 'player'
         JOIN teams t ON t.id = tm.team_id
         JOIN team_seasons ts ON ts.id = tm.season_id AND ts.status = 'active'
        WHERE u.id = ?1 AND t.id = ?2 AND u.role = 'player' AND u.active = 1
          AND t.active = 1 AND tm.active = 1`,
      [playerId, teamId],
    );
    return this.verify(row, password);
  }

  async authenticateCoach(
    teamId: string,
    coachId: string,
    password: string,
  ): Promise<AuthenticationResult> {
    const row = await this.database.one<LoginRow>(
      `SELECT u.id, u.username, u.display_name, u.role,
              u.password_hash, u.password_salt, u.password_iterations,
              u.must_change_password, u.failed_login_attempts, u.locked_until,
              t.id AS team_id, t.name AS team_name, ts.name AS season_name,
              tm.jersey_number
         FROM users u
         JOIN team_memberships tm ON tm.user_id = u.id AND tm.team_role = 'coach'
         JOIN teams t ON t.id = tm.team_id
         JOIN team_seasons ts ON ts.id = tm.season_id AND ts.status = 'active'
        WHERE u.id = ?1 AND t.id = ?2 AND u.role = 'coach' AND u.active = 1
          AND t.active = 1 AND tm.active = 1`,
      [coachId, teamId],
    );
    return this.verify(row, password);
  }

  async authenticateStaff(
    role: 'admin',
    password: string,
  ): Promise<AuthenticationResult> {
    const row = await this.database.one<LoginRow>(
      `SELECT u.id, u.username, u.display_name, u.role,
              u.password_hash, u.password_salt, u.password_iterations,
              u.must_change_password, u.failed_login_attempts, u.locked_until,
              t.id AS team_id, t.name AS team_name, ts.name AS season_name,
              tm.jersey_number
         FROM users u
         LEFT JOIN team_memberships tm ON tm.user_id = u.id AND tm.active = 1
         LEFT JOIN teams t ON t.id = tm.team_id AND t.active = 1
         LEFT JOIN team_seasons ts ON ts.id = tm.season_id AND ts.status = 'active'
        WHERE u.username = ?1 AND u.role = ?1 AND u.active = 1
        ORDER BY t.id
        LIMIT 1`,
      [role],
    );
    return this.verify(row, password);
  }

  async changePassword(
    userId: string,
    currentPasswordValue: unknown,
    newPasswordValue: unknown,
  ): Promise<boolean> {
    const currentPassword = String(currentPasswordValue || '');
    let newPassword: string;
    try {
      newPassword = validateAccountPassword(newPasswordValue);
    } catch (error) {
      throw new RecordValidationError(error instanceof Error ? error.message : String(error));
    }
    const row = await this.database.one<Pick<LoginRow, 'password_hash' | 'password_salt' | 'password_iterations'>>(
      `SELECT password_hash, password_salt, password_iterations
         FROM users WHERE id = ?1 AND active = 1`,
      [userId],
    );
    if (!row || !(await verifyPassword(
      currentPassword,
      row.password_hash,
      row.password_salt,
      Number(row.password_iterations),
    ))) return false;
    if (await verifyPassword(
      newPassword,
      row.password_hash,
      row.password_salt,
      Number(row.password_iterations),
    )) {
      throw new RecordValidationError('Choose a password different from your current password.');
    }
    const credentials = await createPasswordHash(newPassword);
    const now = new Date().toISOString();
    await this.database.execute(
      `UPDATE users SET password_hash = ?2, password_salt = ?3,
                        password_iterations = ?4, must_change_password = 0,
                        failed_login_attempts = 0, locked_until = NULL,
                        password_changed_at = ?5, revision = revision + 1,
                        updated_at = ?5
        WHERE id = ?1`,
      [userId, credentials.hash, credentials.salt, credentials.iterations, now],
    );
    await this.database.execute('DELETE FROM sessions WHERE user_id = ?1', [userId]);
    return true;
  }

  private async verify(
    row: LoginRow | null,
    password: string,
  ): Promise<AuthenticationResult> {
    if (!row) return { status: 'invalid' };
    const now = new Date();
    const lockedUntil = row.locked_until ? new Date(row.locked_until) : null;
    if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
      return { status: 'locked', lockedUntil: lockedUntil.toISOString() };
    }
    const passwordMatches = await verifyPassword(
        password,
        row.password_hash,
        row.password_salt,
        Number(row.password_iterations),
      );
    if (!passwordMatches) {
      const previousFailures = lockedUntil ? 0 : Number(row.failed_login_attempts || 0);
      const failures = previousFailures + 1;
      const nextLock = failures >= MAX_FAILED_LOGIN_ATTEMPTS
        ? new Date(now.getTime() + ACCOUNT_LOCK_MINUTES * 60 * 1000).toISOString()
        : null;
      await this.database.execute(
        `UPDATE users SET failed_login_attempts = ?2, locked_until = ?3,
                          updated_at = ?4 WHERE id = ?1`,
        [row.id, failures, nextLock, now.toISOString()],
      );
      return nextLock
        ? { status: 'locked', lockedUntil: nextLock }
        : { status: 'invalid' };
    }
    await this.database.execute(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL,
                        last_login_at = ?2, updated_at = ?2 WHERE id = ?1`,
      [row.id, now.toISOString()],
    );
    return { status: 'success', user: {
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
    } };
  }
}
