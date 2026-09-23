-- Promote legacy numbered titles to descriptive names without rewriting history.
CREATE TABLE situation_name_backfill AS
SELECT key FROM situations
WHERE (lower(trim(title)) GLOB 'situation #[0-9]*' OR lower(trim(title)) GLOB 'situation [0-9]*')
  AND trim(COALESCE(description, '')) <> '' AND length(trim(description)) <= 120;
UPDATE situations
SET title = trim(description), description = '',
    payload_json = json_set(payload_json, '$.title', trim(description), '$.desc', ''),
    revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE key IN (SELECT key FROM situation_name_backfill);
INSERT OR IGNORE INTO situation_versions
  (situation_key, revision, title, category, difficulty, payload_json, created_at)
SELECT key, revision, title, category, difficulty_level, payload_json, updated_at
  FROM situations
 WHERE key IN (SELECT key FROM situation_name_backfill);

INSERT OR IGNORE INTO situation_version_teaching_categories
  (situation_key, situation_revision, category_id, is_primary, sort_order)
SELECT stc.situation_key, s.revision, stc.category_id, stc.is_primary, stc.sort_order
  FROM situation_teaching_categories stc
  JOIN situations s ON s.key = stc.situation_key
 WHERE stc.situation_key IN (SELECT key FROM situation_name_backfill);

INSERT OR IGNORE INTO situation_version_play_outcomes
  (situation_key, situation_revision, play_result, batter_result,
   outs_recorded, batter_out_type, batter_out_order, review_status)
SELECT spo.situation_key, s.revision, spo.play_result, spo.batter_result,
       spo.outs_recorded, spo.batter_out_type, spo.batter_out_order, spo.review_status
  FROM situation_play_outcomes spo
  JOIN situations s ON s.key = spo.situation_key
 WHERE spo.situation_key IN (SELECT key FROM situation_name_backfill);

INSERT OR IGNORE INTO situation_version_runner_outcomes
  (situation_key, situation_revision, starting_base, runner_result,
   out_type, out_order, tagged_up)
SELECT sro.situation_key, s.revision, sro.starting_base, sro.runner_result,
       sro.out_type, sro.out_order, sro.tagged_up
  FROM situation_runner_outcomes sro
  JOIN situations s ON s.key = sro.situation_key
 WHERE sro.situation_key IN (SELECT key FROM situation_name_backfill);

DROP TABLE situation_name_backfill;
