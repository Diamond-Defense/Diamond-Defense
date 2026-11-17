-- Use ASCII letters and dot-separated name parts. Numeric suffixes are
-- reserved for collisions, so a generated base never overlaps a duplicate.
CREATE VIEW account_username_bases AS
WITH RECURSIVE parts(id, remaining, base) AS (
  SELECT id, lower(trim(display_name)), ''
  FROM users WHERE role IN ('player', 'coach')
  UNION ALL
  SELECT id, substr(remaining, 2),
    CASE WHEN substr(remaining, 1, 1) GLOB '[a-z]' THEN base || substr(remaining, 1, 1)
         WHEN base <> '' AND substr(base, -1) <> '.' THEN base || '.'
         ELSE base END
  FROM parts WHERE remaining <> ''
)
SELECT id, CASE trim(base, '.') WHEN '' THEN 'account' WHEN 'admin' THEN 'admin.account'
                 ELSE trim(base, '.') END AS base
FROM parts WHERE remaining = '';

-- Release the old team-derived usernames before assigning the new ones.
UPDATE users SET username = '~' || id WHERE role IN ('player', 'coach');

WITH ranked AS (
  SELECT a.id, a.base, row_number() OVER (PARTITION BY a.base ORDER BY u.created_at, u.id) AS ordinal
  FROM account_username_bases a JOIN users u ON u.id = a.id
)
UPDATE users SET username = (
  SELECT base || CASE WHEN ordinal = 1 THEN '' ELSE cast(ordinal AS TEXT) END
  FROM ranked WHERE ranked.id = users.id
)
WHERE role IN ('player', 'coach');

CREATE UNIQUE INDEX users_username_case_insensitive ON users(username COLLATE NOCASE);

-- All existing account creation paths insert the stable ID as a placeholder.
-- Assigning the name inside the insert also protects concurrent roster imports.
CREATE TRIGGER assign_account_username AFTER INSERT ON users
WHEN NEW.role IN ('player', 'coach') AND NEW.username = NEW.id
BEGIN
  UPDATE users SET username = (
    WITH RECURSIVE candidates(base, ordinal, value) AS (
      SELECT base, 1, base FROM account_username_bases WHERE id = NEW.id
      UNION ALL
      SELECT base, ordinal + 1, base || cast(ordinal + 1 AS TEXT)
      FROM candidates WHERE EXISTS (
        SELECT 1 FROM users WHERE username = candidates.value COLLATE NOCASE AND id <> NEW.id
      )
    )
    SELECT value FROM candidates
    WHERE NOT EXISTS (
      SELECT 1 FROM users WHERE username = candidates.value COLLATE NOCASE AND id <> NEW.id
    )
    LIMIT 1
  ) WHERE id = NEW.id;
END;
