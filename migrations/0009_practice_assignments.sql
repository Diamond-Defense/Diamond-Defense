PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS practice_assignments (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  coach_id TEXT NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  due_at TEXT,
  published_at TEXT,
  completed_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS assignment_recipients (
  assignment_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'in_progress', 'completed')),
  assigned_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  PRIMARY KEY (assignment_id, player_id),
  FOREIGN KEY (assignment_id) REFERENCES practice_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assignment_situations (
  assignment_id TEXT NOT NULL,
  situation_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  required_repetitions INTEGER NOT NULL DEFAULT 1
    CHECK (required_repetitions BETWEEN 1 AND 100),
  created_at TEXT NOT NULL,
  PRIMARY KEY (assignment_id, situation_key),
  FOREIGN KEY (assignment_id) REFERENCES practice_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (situation_key) REFERENCES situations(key) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS assignment_progress (
  assignment_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  situation_key TEXT NOT NULL,
  completed_repetitions INTEGER NOT NULL DEFAULT 0,
  passed_repetitions INTEGER NOT NULL DEFAULT 0,
  last_attempt_id TEXT,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (assignment_id, player_id, situation_key),
  FOREIGN KEY (assignment_id, player_id)
    REFERENCES assignment_recipients(assignment_id, player_id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id, situation_key)
    REFERENCES assignment_situations(assignment_id, situation_key) ON DELETE CASCADE,
  FOREIGN KEY (last_attempt_id) REFERENCES attempts(id) ON DELETE SET NULL
);

ALTER TABLE attempts ADD COLUMN assignment_id TEXT
  REFERENCES practice_assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_practice_assignments_team_status
  ON practice_assignments(team_id, status, due_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_practice_assignments_coach
  ON practice_assignments(coach_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_recipients_player_status
  ON assignment_recipients(player_id, status, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_situations_order
  ON assignment_situations(assignment_id, sort_order, situation_key);
CREATE INDEX IF NOT EXISTS idx_attempts_assignment_player_created
  ON attempts(assignment_id, player_id, created_at DESC);
