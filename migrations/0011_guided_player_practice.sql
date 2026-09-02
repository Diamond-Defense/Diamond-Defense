PRAGMA foreign_keys = ON;

-- A practice can be ended without deleting its history. Keeping these as
-- additive columns preserves compatibility with SQLite providers and avoids a
-- table rebuild solely to expand the original status CHECK constraint.
ALTER TABLE practice_assignments ADD COLUMN closed_at TEXT;
ALTER TABLE practice_assignments ADD COLUMN cancelled_at TEXT;
ALTER TABLE practice_assignments ADD COLUMN ended_by TEXT
  REFERENCES users(id) ON DELETE SET NULL;

-- Exactly one published assignment can own a player's guided-practice lock.
-- Locks are released when the recipient completes the assignment or when a
-- coach closes, cancels, or archives it.
ALTER TABLE assignment_recipients ADD COLUMN lock_active INTEGER NOT NULL DEFAULT 0
  CHECK (lock_active IN (0, 1));
ALTER TABLE assignment_recipients ADD COLUMN released_at TEXT;

-- Preserve an existing in-progress assignment if one exists. The NOT EXISTS
-- clause deterministically chooses the earliest assignment for older data that
-- happened to contain multiple in-progress recipients.
UPDATE assignment_recipients
   SET lock_active = 1
 WHERE status = 'in_progress'
   AND EXISTS (
     SELECT 1 FROM practice_assignments pa
      WHERE pa.id = assignment_recipients.assignment_id
        AND pa.status = 'active'
   )
   AND NOT EXISTS (
     SELECT 1
       FROM assignment_recipients earlier
       JOIN practice_assignments earlier_assignment
         ON earlier_assignment.id = earlier.assignment_id
      WHERE earlier.player_id = assignment_recipients.player_id
        AND earlier.status = 'in_progress'
        AND earlier_assignment.status = 'active'
        AND (
          earlier.assigned_at < assignment_recipients.assigned_at
          OR (
            earlier.assigned_at = assignment_recipients.assigned_at
            AND earlier.assignment_id < assignment_recipients.assignment_id
          )
        )
   );

CREATE UNIQUE INDEX IF NOT EXISTS idx_assignment_recipients_one_player_lock
  ON assignment_recipients(player_id)
  WHERE lock_active = 1;

CREATE INDEX IF NOT EXISTS idx_practice_assignments_player_availability
  ON practice_assignments(status, closed_at, cancelled_at, due_at);
