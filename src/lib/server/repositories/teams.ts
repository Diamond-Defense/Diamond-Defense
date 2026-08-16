import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';
import { createPasswordHash } from '$lib/server/security/passwords';

interface TeamRow {
  id: string;
  name: string;
  coach_email: string;
}

interface PlayerRow {
  team_id: string;
  player_id: string;
  name: string;
  number: string;
}

export interface TeamOption {
  id: string;
  name: string;
  coachEmail: string;
  roster: Array<{
    playerId: string;
    name: string;
    number: string;
  }>;
}

interface TeamInput extends TeamOption {
  roster: Array<TeamOption['roster'][number] & { password?: string }>;
}

export class SqliteTeamRepository {
  constructor(private readonly database: SqliteDatabaseAdapter) {}

  async listOptions(): Promise<TeamOption[]> {
    const teams = await this.database.all<TeamRow>(
      'SELECT id, name, coach_email FROM teams ORDER BY name',
    );
    const players = await this.database.all<PlayerRow>(
      `SELECT tm.team_id, u.id AS player_id, u.display_name AS name,
              tm.jersey_number AS number
         FROM team_memberships tm
         JOIN users u ON u.id = tm.user_id
        WHERE tm.team_role = 'player' AND u.active = 1
        ORDER BY tm.team_id, CAST(tm.jersey_number AS INTEGER), u.display_name`,
    );
    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      coachEmail: team.coach_email,
      roster: players
        .filter((player) => player.team_id === team.id)
        .map((player) => ({
          playerId: player.player_id,
          name: player.name,
          number: player.number,
        })),
    }));
  }

  async sync(teams: TeamInput[]): Promise<void> {
    const now = new Date().toISOString();
    const incomingTeamIds = teams.map((team) => String(team.id));
    const currentTeams = await this.database.all<{ id: string }>(
      'SELECT id FROM teams',
    );

    for (const team of currentTeams) {
      if (!incomingTeamIds.includes(team.id)) {
        await this.database.execute('DELETE FROM teams WHERE id = ?1', [team.id]);
      }
    }

    for (const team of teams) {
      await this.database.execute(
        `INSERT INTO teams (id, name, coach_email, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           coach_email = excluded.coach_email,
           updated_at = excluded.updated_at`,
        [team.id, team.name, team.coachEmail || '', now],
      );

      const incomingPlayers = (team.roster ?? []).map((player) =>
        String(player.playerId),
      );
      const currentPlayers = await this.database.all<{ user_id: string }>(
        `SELECT user_id FROM team_memberships
          WHERE team_id = ?1 AND team_role = 'player'`,
        [team.id],
      );
      for (const current of currentPlayers) {
        if (!incomingPlayers.includes(current.user_id)) {
          await this.database.execute(
            'DELETE FROM team_memberships WHERE team_id = ?1 AND user_id = ?2',
            [team.id, current.user_id],
          );
        }
      }

      for (const player of team.roster ?? []) {
        const existing = await this.database.one<{ id: string }>(
          'SELECT id FROM users WHERE id = ?1',
          [player.playerId],
        );
        if (!existing) {
          const password = player.password?.trim();
          if (!password) {
            throw new Error(`A password is required for new player ${player.name}.`);
          }
          const credentials = await createPasswordHash(password);
          await this.database.execute(
            `INSERT INTO users
              (id, username, display_name, role, password_hash, password_salt,
               password_iterations, active, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'player', ?4, ?5, ?6, 1, ?7, ?7)`,
            [
              player.playerId,
              `${team.id}:${player.playerId}`,
              player.name,
              credentials.hash,
              credentials.salt,
              credentials.iterations,
              now,
            ],
          );
        } else {
          await this.database.execute(
            `UPDATE users SET username = ?2, display_name = ?3, active = 1,
                              updated_at = ?4
              WHERE id = ?1`,
            [
              player.playerId,
              `${team.id}:${player.playerId}`,
              player.name,
              now,
            ],
          );
          if (player.password?.trim()) {
            const credentials = await createPasswordHash(player.password.trim());
            await this.database.execute(
              `UPDATE users SET password_hash = ?2, password_salt = ?3,
                                password_iterations = ?4, updated_at = ?5
                WHERE id = ?1`,
              [
                player.playerId,
                credentials.hash,
                credentials.salt,
                credentials.iterations,
                now,
              ],
            );
          }
        }
        await this.database.execute(
          `INSERT INTO team_memberships
            (team_id, user_id, team_role, jersey_number, created_at)
           VALUES (?1, ?2, 'player', ?3, ?4)
           ON CONFLICT(team_id, user_id) DO UPDATE SET
             team_role = 'player', jersey_number = excluded.jersey_number`,
          [team.id, player.playerId, player.number || '', now],
        );
      }
    }

    await this.database.execute(
      `DELETE FROM users
        WHERE role = 'player'
          AND NOT EXISTS (
            SELECT 1 FROM team_memberships tm WHERE tm.user_id = users.id
          )`,
    );
  }
}
