ALTER TABLE practice_assignments ADD COLUMN archived_from_status TEXT;
ALTER TABLE practice_assignments ADD COLUMN source_assignment_id TEXT REFERENCES practice_assignments(id) ON DELETE SET NULL;
ALTER TABLE practice_assignments ADD COLUMN cycle_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE assignment_recipients ADD COLUMN player_name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE assignment_recipients ADD COLUMN player_number_snapshot TEXT NOT NULL DEFAULT '';

UPDATE assignment_recipients
   SET player_name_snapshot = COALESCE((
         SELECT u.display_name FROM users u WHERE u.id = assignment_recipients.player_id
       ), ''),
       player_number_snapshot = COALESCE((
         SELECT tm.jersey_number
           FROM team_memberships tm
           JOIN practice_assignments pa ON pa.id = assignment_recipients.assignment_id
          WHERE tm.team_id = pa.team_id
            AND tm.user_id = assignment_recipients.player_id
          LIMIT 1
       ), '');

CREATE INDEX IF NOT EXISTS idx_practice_assignments_lifecycle
  ON practice_assignments(team_id, status, closed_at, cancelled_at, archived_at, updated_at);

CREATE INDEX IF NOT EXISTS idx_practice_assignments_source
  ON practice_assignments(source_assignment_id, cycle_number);
