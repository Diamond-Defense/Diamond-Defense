import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';
import { verifyPassword } from '$lib/server/security/passwords';

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
  coach_email: string | null;
  jersey_number: string | null;
}

export interface LoginResult {
  id: string;
  username: string;
  displayName: string;
  role: LoginRow['role'];
  teamId: string | null;
  teamName: string | null;
  coachEmail: string | null;
  jerseyNumber: string | null;
}

export class SqliteAuthRepository {
  constructor(private readonly database: SqliteDatabaseAdapter) {}

  async authenticatePlayer(
    teamId: string,
    playerId: string,
    password: string,
  ): Promise<LoginResult | null> {
    const row = await this.database.one<LoginRow>(
      `SELECT u.id, u.username, u.display_name, u.role,
              u.password_hash, u.password_salt, u.password_iterations,
              t.id AS team_id, t.name AS team_name, t.coach_email,
              tm.jersey_number
         FROM users u
         JOIN team_memberships tm ON tm.user_id = u.id AND tm.team_role = 'player'
         JOIN teams t ON t.id = tm.team_id
        WHERE u.id = ?1 AND t.id = ?2 AND u.role = 'player' AND u.active = 1
          AND t.active = 1 AND tm.active = 1`,
      [playerId, teamId],
    );
    return this.verify(row, password);
  }

  async authenticateStaff(
    role: 'coach' | 'admin',
    password: string,
  ): Promise<LoginResult | null> {
    const row = await this.database.one<LoginRow>(
      `SELECT u.id, u.username, u.display_name, u.role,
              u.password_hash, u.password_salt, u.password_iterations,
              t.id AS team_id, t.name AS team_name, t.coach_email,
              tm.jersey_number
         FROM users u
         LEFT JOIN team_memberships tm ON tm.user_id = u.id AND tm.team_role = 'coach' AND tm.active = 1
         LEFT JOIN teams t ON t.id = tm.team_id AND t.active = 1
        WHERE u.username = ?1 AND u.role = ?1 AND u.active = 1
        ORDER BY t.id
        LIMIT 1`,
      [role],
    );
    return this.verify(row, password);
  }

  private async verify(
    row: LoginRow | null,
    password: string,
  ): Promise<LoginResult | null> {
    if (
      !row ||
      !(await verifyPassword(
        password,
        row.password_hash,
        row.password_salt,
        Number(row.password_iterations),
      ))
    ) {
      return null;
    }
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      teamId: row.team_id,
      teamName: row.team_name,
      coachEmail: row.coach_email,
      jerseyNumber: row.jersey_number,
    };
  }
}
