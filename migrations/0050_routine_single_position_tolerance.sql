-- Reviewed S01/S02 role-specific positioning tolerance. Animation paths and timing are unchanged.
UPDATE situations SET payload_json=json_patch(payload_json,'{"targets":{"1B":{"tol":145},"2B":{"tol":90},"3B":{"tol":90},"C":{"tol":120},"CF":{"tol":135,"notes":"Back up LF from deeper in the outfield, ready to stop a ball that gets through. Allow space to react rather than crowding the pickup."},"RF":{"tol":155,"notes":"Back up the throw to second from beyond the receiver, in line with the incoming throw. Adjust depth to stop an overthrow."},"P":{"tol":100},"SS":{"tol":82}}}'),revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='BD-01' AND library_scope='global';
UPDATE situations SET payload_json=json_patch(payload_json,'{"targets":{"1B":{"tol":145},"SS":{"tol":90},"3B":{"tol":90},"C":{"tol":120},"LF":{"tol":165,"notes":"Back up CF from the left-field side and deeper than the pickup. Leave room to react to a ball that gets through."},"RF":{"tol":165,"notes":"Back up CF from the right-field side and deeper than the pickup. Leave room to react to a ball that gets through."},"P":{"tol":120,"notes":"Back up the throw to second from behind the receiver, between second and the mound. Adjust depth to stop an overthrow and stay clear of the runner."},"2B":{"tol":77}}}'),revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='BD-02' AND library_scope='global';

INSERT OR IGNORE INTO situation_versions
  (situation_key, revision, title, category, difficulty, payload_json, created_at)
SELECT key, revision, title, category, difficulty_level, payload_json, updated_at
  FROM situations
 WHERE key IN ('BD-01','BD-02') AND library_scope='global';

INSERT OR IGNORE INTO situation_version_teaching_categories
  (situation_key, situation_revision, category_id, is_primary, sort_order)
SELECT stc.situation_key, s.revision, stc.category_id, stc.is_primary, stc.sort_order
  FROM situation_teaching_categories stc
  JOIN situations s ON s.key = stc.situation_key
 WHERE stc.situation_key IN ('BD-01','BD-02') AND s.library_scope='global';

INSERT OR IGNORE INTO situation_version_play_outcomes
  (situation_key, situation_revision, play_result, batter_result,
   outs_recorded, batter_out_type, batter_out_order, review_status)
SELECT spo.situation_key, s.revision, spo.play_result, spo.batter_result,
       spo.outs_recorded, spo.batter_out_type, spo.batter_out_order, spo.review_status
  FROM situation_play_outcomes spo
  JOIN situations s ON s.key = spo.situation_key
 WHERE spo.situation_key IN ('BD-01','BD-02') AND s.library_scope='global';

INSERT OR IGNORE INTO situation_version_runner_outcomes
  (situation_key, situation_revision, starting_base, runner_result,
   out_type, out_order, tagged_up)
SELECT sro.situation_key, s.revision, sro.starting_base, sro.runner_result,
       sro.out_type, sro.out_order, sro.tagged_up
  FROM situation_runner_outcomes sro
  JOIN situations s ON s.key = sro.situation_key
 WHERE sro.situation_key IN ('BD-01','BD-02') AND s.library_scope='global';
