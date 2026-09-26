-- Retire audience dimensions from identity without rewriting historical payloads.
-- Existing collisions remain legacy records until staff explicitly distinguish them.
-- D1 disallows TEMP tables. This staging table is dropped before completion.
CREATE TABLE migration_0024_situation_identity AS
SELECT key, json_array(json_extract(identity_key,'$[0]'),json_extract(identity_key,'$[4]')) AS identity
FROM situations WHERE identity_key IS NOT NULL;
UPDATE situations SET identity_key = NULL;
UPDATE situations SET identity_key = (SELECT identity FROM migration_0024_situation_identity WHERE key = situations.key)
WHERE key IN (SELECT key FROM migration_0024_situation_identity)
AND (active = 0 OR NOT EXISTS (
  SELECT 1 FROM migration_0024_situation_identity a JOIN migration_0024_situation_identity b ON a.identity = b.identity AND a.key != b.key
  JOIN situations other ON other.key = b.key AND other.active = 1
  WHERE a.key = situations.key
));
DROP TABLE migration_0024_situation_identity;
