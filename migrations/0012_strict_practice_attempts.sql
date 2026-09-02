PRAGMA foreign_keys = ON;

-- Quiz-mode situations allow one run only. The run ID is claimed before the
-- attempt row is created so a reset, second tab, or concurrent request cannot
-- obtain another attempt for the same player and assigned situation.
ALTER TABLE assignment_progress ADD COLUMN attempt_run_id TEXT;

UPDATE assignment_progress
   SET attempt_run_id = (
     SELECT a.run_id
       FROM attempts a
      WHERE a.id = assignment_progress.last_attempt_id
   )
 WHERE last_attempt_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_assignment_progress_attempt_run
  ON assignment_progress(attempt_run_id)
  WHERE attempt_run_id IS NOT NULL;
