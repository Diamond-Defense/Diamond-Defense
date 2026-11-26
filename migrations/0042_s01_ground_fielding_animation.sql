-- Reference image #1: S01 / BD-01, Single to LF, no runners on.
-- Publish an authored ground-fielding animation without changing prior revisions.
UPDATE situations
   SET payload_json = json_patch(payload_json, '{"hit":{"x":900,"y":850},"targets":{"P":{"x":1827,"y":1016,"tol":81,"notes":"Move into backup position between mound and 2B. Stay out of the runners lane."},"C":{"x":2231,"y":1389,"tol":99,"notes":"Follow the runner to first to back up possible overthrow on back pick."},"1B":{"x":2166,"y":1184,"tol":67,"notes":"After seeing the runner touch 1B, cover the bag. Give the runner a lane. Be ready for possible back pick."},"2B":{"x":1595,"y":821,"tol":67,"notes":"Move into position to cover 2B, receive throw. Give the runner a lane."},"SS":{"x":1220,"y":852,"tol":72,"notes":"Line up between LF and 2B as the cut/relay. Listen for the call and relay to 2B when needed."},"3B":{"x":1000,"y":1250,"tol":67,"notes":"Stay close to 3B bag. Be ready for play."},"LF":{"x":900,"y":850,"tol":67,"notes":"Charge the single, gather it off the ground, then make a firm, low throw through SS toward 2B."},"CF":{"x":990,"y":730,"tol":108,"notes":"Sprint to back up LF."},"RF":{"x":2000,"y":860,"tol":109,"notes":"Move behind 2B in line with the throw from LF to back up an overthrow."}},"seqNote":"Routine single, no runners on: LF fields the ball after it lands and bounces. Throw through SS to 2B to keep the batter at first. Coverage and backups move at contact.","boardAnimation":{"version":2,"movements":{"P":[{"path":[{"x":1570,"y":1240},{"x":1827,"y":1016}],"start":{"event":"contact"},"durationMs":800}],"C":[{"path":[{"x":1578,"y":1833},{"x":2231,"y":1389}],"start":{"event":"contact"},"durationMs":1450}],"1B":[{"path":[{"x":2081,"y":1172},{"x":2166,"y":1184}],"start":{"event":"contact"},"durationMs":1250}],"2B":[{"path":[{"x":1934,"y":941},{"x":1595,"y":821}],"start":{"event":"contact"},"durationMs":800}],"SS":[{"path":[{"x":1202,"y":935},{"x":1220,"y":852}],"start":{"event":"contact"},"durationMs":750}],"3B":[{"path":[{"x":1047,"y":1170},{"x":1000,"y":1250}],"start":{"event":"contact"},"durationMs":650}],"LF":[{"path":[{"x":750,"y":679},{"x":900,"y":850}],"start":{"event":"contact"},"durationMs":900}],"CF":[{"path":[{"x":1570,"y":476},{"x":990,"y":730}],"start":{"event":"contact"},"durationMs":1100}],"RF":[{"path":[{"x":2385,"y":683},{"x":2000,"y":860}],"start":{"event":"contact"},"durationMs":1000}]},"battedBall":{"type":"line_drive","start":{"x":1577,"y":1734},"destination":{"x":900,"y":850},"fielding":"ground","fielder":"LF","bounce":{"durationMs":350,"distance":150,"height":26}},"running":{"result":"single","destinations":{"batter":"first"}}},"playOutcome":{"result":"single","batterResult":"first","outsRecorded":0,"reviewStatus":"ready"},"runnerOutcomes":[]}'),
       revision = revision + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE key = 'BD-01' AND library_scope = 'global';

INSERT OR IGNORE INTO situation_versions
  (situation_key, revision, title, category, difficulty, payload_json, created_at)
SELECT key, revision, title, category, difficulty_level, payload_json, updated_at
  FROM situations
 WHERE key = 'BD-01';

INSERT OR IGNORE INTO situation_version_teaching_categories
  (situation_key, situation_revision, category_id, is_primary, sort_order)
SELECT stc.situation_key, s.revision, stc.category_id, stc.is_primary, stc.sort_order
  FROM situation_teaching_categories stc
  JOIN situations s ON s.key = stc.situation_key
 WHERE stc.situation_key = 'BD-01';

INSERT OR IGNORE INTO situation_version_play_outcomes
  (situation_key, situation_revision, play_result, batter_result,
   outs_recorded, batter_out_type, batter_out_order, review_status)
SELECT spo.situation_key, s.revision, spo.play_result, spo.batter_result,
       spo.outs_recorded, spo.batter_out_type, spo.batter_out_order, spo.review_status
  FROM situation_play_outcomes spo
  JOIN situations s ON s.key = spo.situation_key
 WHERE spo.situation_key = 'BD-01';

INSERT OR IGNORE INTO situation_version_runner_outcomes
  (situation_key, situation_revision, starting_base, runner_result,
   out_type, out_order, tagged_up)
SELECT sro.situation_key, s.revision, sro.starting_base, sro.runner_result,
       sro.out_type, sro.out_order, sro.tagged_up
  FROM situation_runner_outcomes sro
  JOIN situations s ON s.key = sro.situation_key
 WHERE sro.situation_key = 'BD-01';
