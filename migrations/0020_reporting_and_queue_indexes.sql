PRAGMA foreign_keys = ON;

-- Report filters use the immutable attempt snapshot and never need to scan a
-- different team's history. These indexes cover the filter paths not already
-- covered by the earlier player, season, outcome, and situation indexes.
CREATE INDEX IF NOT EXISTS idx_attempts_team_assignment_created
  ON attempts(team_id, assignment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_attempts_team_lifecycle_created
  ON attempts(team_id, created_at DESC)
  WHERE lifecycle_status = 'incomplete';

-- This expression matches the report date-range predicate. Completed attempts
-- sort/filter by completion time while unfinished legacy rows fall back to the
-- creation timestamp.
CREATE INDEX IF NOT EXISTS idx_attempts_team_report_date
  ON attempts(team_id, COALESCE(completed_at, created_at) DESC);

-- Pending-player checks are on the critical login and navigation path. Partial
-- indexes avoid storing entries for withdrawn recipients or completed work.
CREATE INDEX IF NOT EXISTS idx_assignment_recipients_player_pending
  ON assignment_recipients(player_id, assigned_at DESC, assignment_id)
  WHERE withdrawn_at IS NULL AND status <> 'completed';
