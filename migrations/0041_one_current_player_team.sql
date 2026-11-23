-- Existing duplicate active player memberships must be resolved explicitly before applying.
-- Coaches intentionally remain eligible for multiple current team memberships.
CREATE UNIQUE INDEX IF NOT EXISTS one_current_player_team ON team_memberships(user_id) WHERE active = 1 AND team_role = 'player';
