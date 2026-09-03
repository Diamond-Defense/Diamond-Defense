PRAGMA foreign_keys = ON;

-- A player account represents one person across every season and team. Historical
-- memberships remain, but only one team membership may be active at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_one_active_team
  ON team_memberships(user_id)
  WHERE active = 1 AND team_role = 'player';

-- Jersey numbers are unique within an active team roster. Historical seasons
-- retain their number snapshots even after a player changes teams or numbers.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_active_player_number
  ON team_memberships(team_id, jersey_number)
  WHERE active = 1 AND team_role = 'player' AND jersey_number <> '';

CREATE INDEX IF NOT EXISTS idx_memberships_unassigned_players
  ON team_memberships(user_id, active, team_role);
