PRAGMA foreign_keys = ON;

-- Attempts are created when play starts and finalized by updating the same
-- run_id. Existing attempts were all finalized before this migration.
ALTER TABLE attempts ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'completed'
  CHECK (lifecycle_status IN ('incomplete', 'completed', 'abandoned'));
ALTER TABLE attempts ADD COLUMN updated_at TEXT;

UPDATE attempts
   SET lifecycle_status = CASE
         WHEN outcome = 'abandoned' THEN 'abandoned'
         ELSE 'completed'
       END,
       updated_at = COALESCE(completed_at, created_at);

-- Preserve immutable situation revisions used by published assignments.
CREATE TABLE IF NOT EXISTS situation_versions (
  situation_key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'intermediate',
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (situation_key, revision),
  FOREIGN KEY (situation_key) REFERENCES situations(key) ON DELETE CASCADE
);

INSERT OR IGNORE INTO situation_versions
  (situation_key, revision, title, category, difficulty, payload_json, created_at)
SELECT key, revision, title, category, difficulty, payload_json, updated_at
  FROM situations;

ALTER TABLE assignment_situations ADD COLUMN situation_revision INTEGER;
UPDATE assignment_situations
   SET situation_revision = (
     SELECT revision FROM situations WHERE situations.key = assignment_situations.situation_key
   );

-- One assigned situation now requires one completed play-through. The count
-- columns remain for backward compatibility and future mastery modes.
UPDATE assignment_situations SET required_repetitions = 1;

ALTER TABLE assignment_progress ADD COLUMN progress_status TEXT NOT NULL DEFAULT 'not_started'
  CHECK (progress_status IN ('not_started', 'incomplete', 'completed'));
ALTER TABLE assignment_progress ADD COLUMN started_at TEXT;

UPDATE assignment_progress
   SET completed_repetitions = CASE WHEN completed_repetitions > 0 THEN 1 ELSE 0 END,
       passed_repetitions = CASE WHEN passed_repetitions > 0 THEN 1 ELSE 0 END,
       progress_status = CASE
         WHEN completed_repetitions > 0 THEN 'completed'
         WHEN last_attempt_id IS NOT NULL THEN 'incomplete'
         ELSE 'not_started'
       END,
       started_at = CASE
         WHEN last_attempt_id IS NOT NULL THEN updated_at
         ELSE NULL
       END,
       completed_at = CASE
         WHEN completed_repetitions > 0 THEN COALESCE(completed_at, updated_at)
         ELSE NULL
       END;

UPDATE assignment_recipients
   SET status = CASE
         WHEN NOT EXISTS (
           SELECT 1 FROM assignment_progress ap
            WHERE ap.assignment_id = assignment_recipients.assignment_id
              AND ap.player_id = assignment_recipients.player_id
              AND ap.progress_status <> 'completed'
         ) THEN 'completed'
         WHEN EXISTS (
           SELECT 1 FROM assignment_progress ap
            WHERE ap.assignment_id = assignment_recipients.assignment_id
              AND ap.player_id = assignment_recipients.player_id
              AND ap.progress_status = 'incomplete'
         ) THEN 'in_progress'
         ELSE 'assigned'
       END;

UPDATE practice_assignments
   SET status = 'completed',
       completed_at = COALESCE(completed_at, updated_at)
 WHERE status = 'active'
   AND NOT EXISTS (
     SELECT 1 FROM assignment_recipients ar
      WHERE ar.assignment_id = practice_assignments.id
        AND ar.status <> 'completed'
   );

CREATE INDEX IF NOT EXISTS idx_attempts_lifecycle_player_updated
  ON attempts(lifecycle_status, player_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_progress_player_status
  ON assignment_progress(player_id, progress_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_situation_versions_key_revision
  ON situation_versions(situation_key, revision);

