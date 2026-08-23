PRAGMA foreign_keys = ON;

-- One row now represents one started play-through. run_id makes retries from
-- page-unload/reset handling idempotent, while the snapshot columns keep
-- historical reports stable when names or situations are edited later.
ALTER TABLE attempts ADD COLUMN run_id TEXT;
ALTER TABLE attempts ADD COLUMN outcome TEXT
  CHECK (outcome IS NULL OR outcome IN ('passed', 'failed', 'abandoned'));
ALTER TABLE attempts ADD COLUMN started_at TEXT;
ALTER TABLE attempts ADD COLUMN completed_at TEXT;
ALTER TABLE attempts ADD COLUMN abandon_reason TEXT;
ALTER TABLE attempts ADD COLUMN situation_revision INTEGER;
ALTER TABLE attempts ADD COLUMN situation_title TEXT NOT NULL DEFAULT '';
ALTER TABLE attempts ADD COLUMN team_name TEXT NOT NULL DEFAULT '';
ALTER TABLE attempts ADD COLUMN player_name TEXT NOT NULL DEFAULT '';
ALTER TABLE attempts ADD COLUMN player_number TEXT NOT NULL DEFAULT '';

UPDATE attempts
   SET run_id = id,
       outcome = CASE WHEN success = 1 THEN 'passed' ELSE 'failed' END,
       started_at = created_at,
       completed_at = created_at,
       situation_revision = (
         SELECT revision FROM situations WHERE situations.key = attempts.situation_key
       ),
       situation_title = COALESCE((
         SELECT title FROM situations WHERE situations.key = attempts.situation_key
       ), ''),
       team_name = COALESCE((
         SELECT name FROM teams WHERE teams.id = attempts.team_id
       ), ''),
       player_name = COALESCE((
         SELECT display_name FROM users WHERE users.id = attempts.player_id
       ), ''),
       player_number = COALESCE((
         SELECT jersey_number
           FROM team_memberships
          WHERE team_memberships.team_id = attempts.team_id
            AND team_memberships.user_id = attempts.player_id
       ), '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_run_id
  ON attempts(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attempts_team_player_created
  ON attempts(team_id, player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_team_outcome_created
  ON attempts(team_id, outcome, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_team_situation_created
  ON attempts(team_id, situation_key, created_at DESC);
