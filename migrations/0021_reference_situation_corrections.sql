PRAGMA foreign_keys = ON;

-- Reconcile the published playbook situations with the original coaching
-- reference while preserving every previously published revision.
UPDATE situations
   SET payload_json = CASE key
         WHEN 'BD-02' THEN json_set(
           payload_json,
           '$.targets.1B.notes',
             'After seeing the runner touch 1B, cover the bag. Give the runner a lane. Be ready for possible back pick.',
           '$.targets.2B.notes',
             'If the ball is hit to the SS side of 2B, cover the bag. If the ball is hit to the 2B side of the field, you are the cut/relay.'
         )
         WHEN 'BD-04' THEN json_set(
           payload_json,
           '$.playSeq', json_array('LF', 'SS', '3B')
         )
         WHEN 'BD-06' THEN json_set(
           payload_json,
           '$.targets.1B.x', 2166,
           '$.targets.1B.y', 1184,
           '$.playOutcome', json_object(
             'result', 'single',
             'batterResult', 'second',
             'outsRecorded', 0,
             'reviewStatus', 'ready'
           ),
           '$.runnerOutcomes', json_array(json_object(
             'startingBase', 'first',
             'result', 'third',
             'taggedUp', json('false')
           ))
         )
         WHEN 'BD-07' THEN json_set(
           payload_json,
           '$.targets.1B.x', 2166,
           '$.targets.1B.y', 1184
         )
         WHEN 'BD-12' THEN json_set(
           payload_json,
           '$.seqNote',
             'With fewer than two outs, keep the tying or winning run from advancing to third.',
           '$.playOutcome', json_object(
             'result', 'single',
             'batterResult', 'second',
             'outsRecorded', 0,
             'reviewStatus', 'ready'
           ),
           '$.runnerOutcomes', json_array(
             json_object(
               'startingBase', 'first',
               'result', 'third',
               'taggedUp', json('false')
             ),
             json_object(
               'startingBase', 'second',
               'result', 'home',
               'taggedUp', json('false')
             )
           )
         )
         WHEN 'BD-15' THEN json_set(
           payload_json,
           '$.playSeq', json_array('RF', '2B', '3B')
         )
         WHEN 'BD-16' THEN json_set(
           payload_json,
           '$.playSeq', json_array('RF', '2B', 'SS')
         )
         WHEN 'BD-17' THEN json_set(
           payload_json,
           '$.targets.RF.x', 2127,
           '$.targets.RF.y', 762
         )
         WHEN 'BD-18' THEN json_set(
           payload_json,
           '$.targets.RF.x', 2127,
           '$.targets.RF.y', 762
         )
         ELSE payload_json
       END,
       revision = revision + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE key IN (
   'BD-02', 'BD-04', 'BD-06', 'BD-07', 'BD-12',
   'BD-15', 'BD-16', 'BD-17', 'BD-18'
 );

-- These are singles where the batter takes second on the selected throw. The
-- batter destination remains second; only the named hit result is corrected.
UPDATE situation_play_outcomes
   SET play_result = 'single'
 WHERE situation_key IN ('BD-06', 'BD-12');

INSERT OR IGNORE INTO situation_versions
  (situation_key, revision, title, category, difficulty, payload_json, created_at)
SELECT key, revision, title, category, difficulty_level, payload_json, updated_at
  FROM situations
 WHERE key IN (
   'BD-02', 'BD-04', 'BD-06', 'BD-07', 'BD-12',
   'BD-15', 'BD-16', 'BD-17', 'BD-18'
 );

INSERT OR IGNORE INTO situation_version_teaching_categories
  (situation_key, situation_revision, category_id, is_primary, sort_order)
SELECT stc.situation_key, s.revision, stc.category_id, stc.is_primary, stc.sort_order
  FROM situation_teaching_categories stc
  JOIN situations s ON s.key = stc.situation_key
 WHERE stc.situation_key IN (
   'BD-02', 'BD-04', 'BD-06', 'BD-07', 'BD-12',
   'BD-15', 'BD-16', 'BD-17', 'BD-18'
 );

INSERT OR IGNORE INTO situation_version_play_outcomes
  (situation_key, situation_revision, play_result, batter_result,
   outs_recorded, batter_out_type, batter_out_order, review_status)
SELECT spo.situation_key, s.revision, spo.play_result, spo.batter_result,
       spo.outs_recorded, spo.batter_out_type, spo.batter_out_order, spo.review_status
  FROM situation_play_outcomes spo
  JOIN situations s ON s.key = spo.situation_key
 WHERE spo.situation_key IN (
   'BD-02', 'BD-04', 'BD-06', 'BD-07', 'BD-12',
   'BD-15', 'BD-16', 'BD-17', 'BD-18'
 );

INSERT OR IGNORE INTO situation_version_runner_outcomes
  (situation_key, situation_revision, starting_base, runner_result,
   out_type, out_order, tagged_up)
SELECT sro.situation_key, s.revision, sro.starting_base, sro.runner_result,
       sro.out_type, sro.out_order, sro.tagged_up
  FROM situation_runner_outcomes sro
  JOIN situations s ON s.key = sro.situation_key
 WHERE sro.situation_key IN (
   'BD-02', 'BD-04', 'BD-06', 'BD-07', 'BD-12',
   'BD-15', 'BD-16', 'BD-17', 'BD-18'
 );
