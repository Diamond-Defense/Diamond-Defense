PRAGMA foreign_keys = ON;

-- The UI no longer offers a second archived-season state. Existing archived
-- seasons become closed history and can be exported or permanently deleted.
UPDATE team_seasons SET status = 'closed' WHERE status = 'archived';

-- Older builds allowed multiple active team rows with the same name. Preserve
-- every record, but give all legacy duplicates except the best current match a
-- stable, visibly distinct name before enforcing the new rule. Prefer the row
-- with an active season, followed by the most recently updated row.
WITH ranked_active_teams AS (
  SELECT t.id,
         ROW_NUMBER() OVER (
           PARTITION BY lower(trim(t.name))
           ORDER BY
             CASE WHEN EXISTS (
               SELECT 1 FROM team_seasons ts
                WHERE ts.team_id = t.id AND ts.status = 'active'
             ) THEN 0 ELSE 1 END,
             t.updated_at DESC,
             t.id
         ) AS duplicate_rank
    FROM teams t
   WHERE t.active = 1
)
UPDATE teams
   SET name = substr(trim(name), 1, 70) || ' [legacy-' || rowid || ']'
 WHERE id IN (
   SELECT id FROM ranked_active_teams WHERE duplicate_rank > 1
 );

-- A live team name must identify exactly one current team. The season remains
-- a separate record and is appended to the name anywhere people choose a team.
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_unique_active_name
  ON teams(lower(trim(name))) WHERE active = 1;

-- Coaches are individual user accounts; the old team contact address is no
-- longer part of account or roster administration.
ALTER TABLE teams DROP COLUMN coach_email;
