-- Recording review: clearer ground bounce, later pickup, and distinct relay timings.
UPDATE situations SET payload_json=json_patch(payload_json,'{"boardAnimation":{"movements":{"LF":[{"path":[{"x":750,"y":679},{"x":900,"y":850}],"start":{"event":"contact"},"durationMs":850}]},"battedBall":{"bounce":{"durationMs":220,"distance":220,"height":18}},"throwTimings":[{"from":"LF","to":"SS","durationMs":220,"transferMs":90},{"from":"SS","to":"2B","durationMs":180,"transferMs":70}]}}'), revision=revision+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='BD-01' AND library_scope='global';

INSERT OR IGNORE INTO situation_versions
  (situation_key, revision, title, category, difficulty, payload_json, created_at)
SELECT key, revision, title, category, difficulty_level, payload_json, updated_at
  FROM situations
 WHERE key = 'BD-01' AND library_scope='global';

INSERT OR IGNORE INTO situation_version_teaching_categories
  (situation_key, situation_revision, category_id, is_primary, sort_order)
SELECT stc.situation_key, s.revision, stc.category_id, stc.is_primary, stc.sort_order
  FROM situation_teaching_categories stc
  JOIN situations s ON s.key = stc.situation_key
 WHERE stc.situation_key = 'BD-01' AND s.library_scope='global';

INSERT OR IGNORE INTO situation_version_play_outcomes
  (situation_key, situation_revision, play_result, batter_result,
   outs_recorded, batter_out_type, batter_out_order, review_status)
SELECT spo.situation_key, s.revision, spo.play_result, spo.batter_result,
       spo.outs_recorded, spo.batter_out_type, spo.batter_out_order, spo.review_status
  FROM situation_play_outcomes spo
  JOIN situations s ON s.key = spo.situation_key
 WHERE spo.situation_key = 'BD-01' AND s.library_scope='global';

INSERT OR IGNORE INTO situation_version_runner_outcomes
  (situation_key, situation_revision, starting_base, runner_result,
   out_type, out_order, tagged_up)
SELECT sro.situation_key, s.revision, sro.starting_base, sro.runner_result,
       sro.out_type, sro.out_order, sro.tagged_up
  FROM situation_runner_outcomes sro
  JOIN situations s ON s.key = sro.situation_key
 WHERE sro.situation_key = 'BD-01' AND s.library_scope='global';
