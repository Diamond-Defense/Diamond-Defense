-- Confirm the fielding assumption only for the existing reviewed collection.
-- Minimal metadata preserves all authored geometry, routes, timings and outcomes.
CREATE TABLE _migration_0045_ground_catalog_keys AS
 SELECT key FROM situations WHERE active=1 AND key IN ('BD-01','BD-02','BD-03','BD-04','BD-05','BD-06','BD-07','BD-08','BD-09','BD-10-1','BD-10-2','BD-10-3','BD-11','BD-12','BD-13','BD-14','BD-15','BD-16','BD-17','BD-18','BD-19','BD-20','variation-6bf770b2-59df-428a-8cef-688c1417868d','promoted-b987c085-8805-4100-b2cf-805e0aa52714','promoted-b8aa0115-f957-4b17-bbb4-7aee21667def','promoted-b187896a-d331-4e26-a200-12d981c07ed0','variation-78acd643-6a14-4e02-a566-07683f3633f4');
UPDATE situations SET payload_json=json_set(payload_json,
 '$.boardAnimation.version',COALESCE(json_extract(payload_json,'$.boardAnimation.version'),2),
 '$.boardAnimation.movements',json(COALESCE(json_extract(payload_json,'$.boardAnimation.movements'),'{}')),
 '$.boardAnimation.battedBall',json_set(json(COALESCE(json_extract(payload_json,'$.boardAnimation.battedBall'),json_object(
 'type',CASE json_extract(payload_json,'$.hitType') WHEN 'line' THEN 'line_drive' WHEN 'popup' THEN 'pop_fly' ELSE 'ground_ball' END,
 'start',json_object('x',1577,'y',1734),'destination',json_extract(payload_json,'$.hit')))),
 '$.fielding','ground','$.fielder',json_extract(payload_json,'$.playSeq[0]'))),
 revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE key IN (SELECT key FROM _migration_0045_ground_catalog_keys);

INSERT OR IGNORE INTO situation_versions
  (situation_key, revision, title, category, difficulty, payload_json, created_at)
SELECT key, revision, title, category, difficulty_level, payload_json, updated_at
  FROM situations
 WHERE key IN (SELECT key FROM _migration_0045_ground_catalog_keys);

INSERT OR IGNORE INTO situation_version_teaching_categories
  (situation_key, situation_revision, category_id, is_primary, sort_order)
SELECT stc.situation_key, s.revision, stc.category_id, stc.is_primary, stc.sort_order
  FROM situation_teaching_categories stc
  JOIN situations s ON s.key = stc.situation_key
 WHERE stc.situation_key IN (SELECT key FROM _migration_0045_ground_catalog_keys);

INSERT OR IGNORE INTO situation_version_play_outcomes
  (situation_key, situation_revision, play_result, batter_result,
   outs_recorded, batter_out_type, batter_out_order, review_status)
SELECT spo.situation_key, s.revision, spo.play_result, spo.batter_result,
       spo.outs_recorded, spo.batter_out_type, spo.batter_out_order, spo.review_status
  FROM situation_play_outcomes spo
  JOIN situations s ON s.key = spo.situation_key
 WHERE spo.situation_key IN (SELECT key FROM _migration_0045_ground_catalog_keys);

INSERT OR IGNORE INTO situation_version_runner_outcomes
  (situation_key, situation_revision, starting_base, runner_result,
   out_type, out_order, tagged_up)
SELECT sro.situation_key, s.revision, sro.starting_base, sro.runner_result,
       sro.out_type, sro.out_order, sro.tagged_up
  FROM situation_runner_outcomes sro
  JOIN situations s ON s.key = sro.situation_key
 WHERE sro.situation_key IN (SELECT key FROM _migration_0045_ground_catalog_keys);

-- Consolidate reviewed overlap without deleting identities or historical revisions.
UPDATE situations AS candidate SET active=0, archived_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE candidate.active=1 AND candidate.library_scope='global'
 AND (candidate.key='promoted-b187896a-d331-4e26-a200-12d981c07ed0'
 OR (candidate.key IN ('BD-10-1','BD-10-2','BD-10-3')
 AND EXISTS (SELECT 1 FROM situations canonical WHERE canonical.key='BD-07' AND canonical.active=1
 AND json_extract(candidate.payload_json,'$.outs')=json_extract(canonical.payload_json,'$.outs')
 AND json_extract(candidate.payload_json,'$.runnersOn.first')=0
 AND json_extract(candidate.payload_json,'$.runnersOn.second')=1
 AND json_extract(candidate.payload_json,'$.runnersOn.third')=0
 AND json_extract(candidate.payload_json,'$.hitType')=json_extract(canonical.payload_json,'$.hitType')
 AND json_extract(candidate.payload_json,'$.playOutcome.result')=json_extract(canonical.payload_json,'$.playOutcome.result')
 AND json_extract(candidate.payload_json,'$.playOutcome.batterResult')=json_extract(canonical.payload_json,'$.playOutcome.batterResult')
 AND json_extract(candidate.payload_json,'$.runnerOutcomes')=json_extract(canonical.payload_json,'$.runnerOutcomes'))))
 AND NOT EXISTS (SELECT 1 FROM assignment_situations a JOIN practice_assignments pa ON pa.id=a.assignment_id
 WHERE a.situation_key=candidate.key AND pa.status='active');

DROP TABLE _migration_0045_ground_catalog_keys;
