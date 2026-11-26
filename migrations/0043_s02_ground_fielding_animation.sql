-- Reference image #2: S02 / BD-02, Single to CF, no runners on.
-- Selected branch: ball on the 2B side, CF -> 2B -> SS covering second.
-- Publish the new animation while preserving previous situation revisions.
UPDATE situations
   SET payload_json = json_patch(payload_json, '{"hit":{"x":1710,"y":700},"targets":{"P":{"x":1480,"y":990,"tol":98,"notes":"Back up the throw to second from behind the bag, between second and the mound. Stay clear of the runner."},"C":{"x":2200,"y":1468,"tol":99,"notes":"Follow the runner to first to back up possible overthrow on back pick."},"1B":{"x":2166,"y":1184,"tol":67,"notes":"After seeing the runner touch 1B, cover the bag. Give the runner a lane. Be ready for possible back pick."},"2B":{"x":1650,"y":765,"tol":67,"notes":"For this single on the 2B side, line up between CF and second as the cut/relay. For a ball on the SS side, cover second instead."},"SS":{"x":1595,"y":821,"tol":72,"notes":"Cover second and receive the relay from 2B for this ball on the 2B side. For a ball on the SS side, become the cut/relay instead."},"3B":{"x":1000,"y":1250,"tol":67,"notes":"Stay close to third and be ready for a play."},"LF":{"x":1370,"y":580,"tol":108,"notes":"Sprint to back up CF."},"CF":{"x":1710,"y":700,"tol":82,"notes":"Charge the single, gather it off the ground after the bounce, and throw firmly through 2B toward SS covering second."},"RF":{"x":1990,"y":580,"tol":124,"notes":"Sprint to back up CF."}},"playSeq":["CF","2B","SS"],"seqNote":"Routine single to CF, no runners on. This branch is on the 2B side: CF gathers after the bounce, 2B cuts/relays, and SS covers second. On the SS side, those two infield roles reverse. The batter holds at first.","boardAnimation":{"version":2,"movements":{"P":[{"path":[{"x":1570,"y":1240},{"x":1480,"y":990}],"start":{"event":"contact"},"durationMs":800}],"C":[{"path":[{"x":1578,"y":1833},{"x":2200,"y":1468}],"start":{"event":"contact"},"durationMs":1450}],"1B":[{"path":[{"x":2087,"y":1155},{"x":2166,"y":1184}],"start":{"event":"contact"},"durationMs":1250}],"2B":[{"path":[{"x":1944,"y":943},{"x":1650,"y":765}],"start":{"event":"contact"},"durationMs":750}],"SS":[{"path":[{"x":1202,"y":933},{"x":1595,"y":821}],"start":{"event":"contact"},"durationMs":800}],"3B":[{"path":[{"x":1004,"y":1147},{"x":1000,"y":1250}],"start":{"event":"contact"},"durationMs":650}],"LF":[{"path":[{"x":744,"y":660},{"x":1370,"y":580}],"start":{"event":"contact"},"durationMs":1100}],"CF":[{"path":[{"x":1629,"y":427},{"x":1710,"y":700}],"start":{"event":"contact"},"durationMs":900}],"RF":[{"path":[{"x":2383,"y":665},{"x":1990,"y":580}],"start":{"event":"contact"},"durationMs":1100}]},"battedBall":{"type":"line_drive","start":{"x":1577,"y":1734},"destination":{"x":1710,"y":700},"fielding":"ground","fielder":"CF","bounce":{"durationMs":350,"distance":150,"height":26}},"running":{"result":"single","destinations":{"batter":"first"}}},"playOutcome":{"result":"single","batterResult":"first","outsRecorded":0,"reviewStatus":"ready"},"runnerOutcomes":[]}'),
       revision = revision + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE key = 'BD-02' AND library_scope = 'global';

INSERT OR IGNORE INTO situation_versions
  (situation_key, revision, title, category, difficulty, payload_json, created_at)
SELECT key, revision, title, category, difficulty_level, payload_json, updated_at
  FROM situations
 WHERE key = 'BD-02';

INSERT OR IGNORE INTO situation_version_teaching_categories
  (situation_key, situation_revision, category_id, is_primary, sort_order)
SELECT stc.situation_key, s.revision, stc.category_id, stc.is_primary, stc.sort_order
  FROM situation_teaching_categories stc
  JOIN situations s ON s.key = stc.situation_key
 WHERE stc.situation_key = 'BD-02';

INSERT OR IGNORE INTO situation_version_play_outcomes
  (situation_key, situation_revision, play_result, batter_result,
   outs_recorded, batter_out_type, batter_out_order, review_status)
SELECT spo.situation_key, s.revision, spo.play_result, spo.batter_result,
       spo.outs_recorded, spo.batter_out_type, spo.batter_out_order, spo.review_status
  FROM situation_play_outcomes spo
  JOIN situations s ON s.key = spo.situation_key
 WHERE spo.situation_key = 'BD-02';

INSERT OR IGNORE INTO situation_version_runner_outcomes
  (situation_key, situation_revision, starting_base, runner_result,
   out_type, out_order, tagged_up)
SELECT sro.situation_key, s.revision, sro.starting_base, sro.runner_result,
       sro.out_type, sro.out_order, sro.tagged_up
  FROM situation_runner_outcomes sro
  JOIN situations s ON s.key = sro.situation_key
 WHERE sro.situation_key = 'BD-02';
