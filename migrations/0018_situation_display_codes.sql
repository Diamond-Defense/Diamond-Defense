ALTER TABLE situations ADD COLUMN display_code TEXT;

-- Preserve the familiar S01 / S10.1 labels for the original playbook records.
WITH parsed AS (
  SELECT key,
         substr(key, 4) AS key_suffix,
         instr(substr(key, 4), '-') AS separator
    FROM situations
   WHERE key GLOB 'BD-[0-9]*'
)
UPDATE situations
   SET display_code = (
     SELECT 'S' || printf(
              '%02d',
              CAST(CASE
                WHEN parsed.separator > 0
                  THEN substr(parsed.key_suffix, 1, parsed.separator - 1)
                ELSE parsed.key_suffix
              END AS INTEGER)
            )
            || CASE
                 WHEN parsed.separator > 0
                   THEN '.' || replace(substr(parsed.key_suffix, parsed.separator + 1), '-', '.')
                 ELSE ''
               END
       FROM parsed
      WHERE parsed.key = situations.key
   )
 WHERE key IN (SELECT key FROM parsed);

-- Number any already-created records after the highest original situation.
WITH numbered AS (
  SELECT key,
         row_number() OVER (ORDER BY created_at, key) AS ordinal,
         COALESCE((
           SELECT MAX(CAST(substr(display_code, 2) AS INTEGER))
             FROM situations
            WHERE display_code GLOB 'S[0-9]*'
         ), 0) AS highest_code
    FROM situations
   WHERE display_code IS NULL OR trim(display_code) = ''
)
UPDATE situations
   SET display_code = (
     SELECT 'S' || printf('%02d', numbered.highest_code + numbered.ordinal)
       FROM numbered
      WHERE numbered.key = situations.key
   )
 WHERE display_code IS NULL OR trim(display_code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_situations_display_code
  ON situations(display_code)
  WHERE display_code IS NOT NULL;

-- Keys remain the stable internal identity. This trigger assigns a concise,
-- immutable public code to every situation created through any application path.
CREATE TRIGGER IF NOT EXISTS situations_assign_display_code
AFTER INSERT ON situations
WHEN NEW.display_code IS NULL OR trim(NEW.display_code) = ''
BEGIN
  UPDATE situations
     SET display_code = 'S' || printf(
       '%02d',
       COALESCE((
         SELECT MAX(CAST(substr(display_code, 2) AS INTEGER))
           FROM situations
          WHERE key <> NEW.key
            AND display_code GLOB 'S[0-9]*'
       ), 0) + 1
     )
   WHERE key = NEW.key;
END;
