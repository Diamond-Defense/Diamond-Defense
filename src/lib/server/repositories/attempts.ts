import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';

interface AttemptRow {
  payload_json: string;
}

export interface AttemptInput {
  situationKey: string;
  phase: 1 | 2;
  stage?: number;
  score?: number;
  total?: number;
  success?: boolean;
  triesUsed?: number;
  timeElapsed?: number;
  ts?: string;
  [key: string]: unknown;
}

export class SqliteAttemptRepository {
  constructor(private readonly database: SqliteDatabaseAdapter) {}

  async save(
    playerId: string,
    teamId: string,
    attempt: AttemptInput,
  ): Promise<void> {
    const createdAt = attempt.ts || new Date().toISOString();
    const payload = {
      ...attempt,
      playerId,
      ts: createdAt,
    };
    await this.database.execute(
      `INSERT INTO attempts
        (id, player_id, team_id, situation_key, phase, stage, score, total,
         success, tries_used, elapsed_seconds, payload_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
      [
        crypto.randomUUID(),
        playerId,
        teamId,
        attempt.situationKey,
        attempt.phase,
        attempt.stage ?? null,
        attempt.score ?? null,
        attempt.total ?? null,
        attempt.success == null ? null : attempt.success ? 1 : 0,
        attempt.triesUsed ?? 0,
        attempt.timeElapsed ?? 0,
        JSON.stringify(payload),
        createdAt,
      ],
    );
  }

  async listForPlayer(playerId: string): Promise<AttemptInput[]> {
    const rows = await this.database.all<AttemptRow>(
      `SELECT payload_json FROM attempts
        WHERE player_id = ?1 ORDER BY created_at`,
      [playerId],
    );
    return rows.map((row) => JSON.parse(row.payload_json) as AttemptInput);
  }

  async listForTeam(teamId: string): Promise<Array<AttemptInput & {
    playerName: string;
    playerNumber: string;
  }>> {
    const rows = await this.database.all<AttemptRow & {
      player_name: string;
      player_number: string;
    }>(
      `SELECT a.payload_json, u.display_name AS player_name,
              tm.jersey_number AS player_number
         FROM attempts a
         JOIN users u ON u.id = a.player_id
         JOIN team_memberships tm
           ON tm.user_id = a.player_id AND tm.team_id = a.team_id
        WHERE a.team_id = ?1
        ORDER BY a.created_at DESC`,
      [teamId],
    );
    return rows.map((row) => ({
      ...(JSON.parse(row.payload_json) as AttemptInput),
      playerName: row.player_name,
      playerNumber: row.player_number,
    }));
  }
}
