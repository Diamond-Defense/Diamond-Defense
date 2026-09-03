PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS team_seasons (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'archived')),
  starts_on TEXT,
  ends_on TEXT,
  closed_at TEXT,
  archived_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_seasons_one_active
  ON team_seasons(team_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_team_seasons_team_status
  ON team_seasons(team_id, status, starts_on DESC, created_at DESC);

INSERT OR IGNORE INTO team_seasons
  (id, team_id, name, status, starts_on, created_at, updated_at)
SELECT id || '-legacy', id, name || ' — Current Season', 'active',
       substr(created_at, 1, 10), created_at, updated_at
  FROM teams;

ALTER TABLE team_memberships ADD COLUMN season_id TEXT
  REFERENCES team_seasons(id) ON DELETE RESTRICT;
ALTER TABLE practice_assignments ADD COLUMN season_id TEXT
  REFERENCES team_seasons(id) ON DELETE RESTRICT;
ALTER TABLE attempts ADD COLUMN season_id TEXT
  REFERENCES team_seasons(id) ON DELETE RESTRICT;
ALTER TABLE assignment_recipients ADD COLUMN withdrawn_at TEXT;

UPDATE team_memberships
   SET season_id = team_id || '-legacy'
 WHERE season_id IS NULL;

UPDATE practice_assignments
   SET season_id = team_id || '-legacy'
 WHERE season_id IS NULL;

UPDATE attempts
   SET season_id = COALESCE(
     (SELECT pa.season_id
        FROM practice_assignments pa
       WHERE pa.id = attempts.assignment_id),
     team_id || '-legacy'
   )
 WHERE season_id IS NULL;

CREATE TABLE IF NOT EXISTS season_memberships (
  season_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  team_role TEXT NOT NULL CHECK (team_role IN ('player', 'coach')),
  display_name_snapshot TEXT NOT NULL,
  jersey_number_snapshot TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'removed')),
  joined_at TEXT NOT NULL,
  removed_at TEXT,
  removed_by TEXT,
  PRIMARY KEY (season_id, user_id),
  FOREIGN KEY (season_id) REFERENCES team_seasons(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (removed_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO season_memberships
  (season_id, team_id, user_id, team_role, display_name_snapshot,
   jersey_number_snapshot, status, joined_at, removed_at, removed_by)
SELECT tm.season_id, tm.team_id, tm.user_id, tm.team_role, u.display_name,
       tm.jersey_number, CASE WHEN tm.active = 1 THEN 'active' ELSE 'removed' END,
       tm.created_at, tm.archived_at, tm.archived_by
  FROM team_memberships tm
  JOIN users u ON u.id = tm.user_id
 WHERE tm.season_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_season_memberships_team_status
  ON season_memberships(team_id, season_id, status, team_role);
CREATE INDEX IF NOT EXISTS idx_season_memberships_user
  ON season_memberships(user_id, season_id);
CREATE INDEX IF NOT EXISTS idx_memberships_active_season
  ON team_memberships(team_id, season_id, active);
CREATE INDEX IF NOT EXISTS idx_assignments_season_status
  ON practice_assignments(team_id, season_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_season_player
  ON attempts(team_id, season_id, player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipients_withdrawn
  ON assignment_recipients(player_id, withdrawn_at, status);

CREATE TABLE IF NOT EXISTS deletion_audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  affected_counts_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deletion_audit_created
  ON deletion_audit(created_at DESC);
