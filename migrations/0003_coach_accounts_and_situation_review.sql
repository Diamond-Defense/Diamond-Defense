PRAGMA foreign_keys = ON;

-- A coach account is linked to one active team at a time. The existing
-- team_memberships table remains the portable source of truth for that link.
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_single_active_team
  ON team_memberships(user_id)
  WHERE team_role = 'coach' AND active = 1;

CREATE TABLE IF NOT EXISTS situation_submissions (
  id TEXT PRIMARY KEY,
  situation_key TEXT NOT NULL,
  submission_type TEXT NOT NULL CHECK (submission_type IN ('create', 'update')),
  payload_json TEXT NOT NULL,
  base_revision INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  review_notes TEXT NOT NULL DEFAULT '',
  submitted_by TEXT NOT NULL,
  reviewed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_situation_submissions_status
  ON situation_submissions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_situation_submissions_submitter
  ON situation_submissions(submitted_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_situation_submissions_key
  ON situation_submissions(situation_key, created_at DESC);
