-- Re-review reference images #1 and #2: consistent routine-single teaching guidance.
-- Preserve geometry, animation, outcomes, titles, and earlier revision snapshots.

UPDATE situations SET payload_json=json_patch(payload_json,'{"targets":{"1B":{"notes":"Stay near first, give the batter-runner a lane, and watch the touch of the bag. Be ready for a possible back pick."},"2B":{"notes":"Cover second, give the runner a lane, and direct SS with a clear through, cut, or hold call. Receive the throw if it comes through."},"SS":{"notes":"Line up between LF and second as the cutoff. Let an accurate throw travel through toward second; cut and relay, redirect, or hold when the receiving infielder calls for it."}},"seqNote":"Routine single to LF, bases empty, 0 outs. LF fields on the ground; SS is the cutoff and 2B covers second. Second is the target, two bases ahead of the batter. Throw through the cutoff toward the target; redirect or hold when the play changes. The batter stops at first. Coverage and backups begin at contact."}'), revision=revision+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='BD-01' AND library_scope='global';

UPDATE situations SET payload_json=json_patch(payload_json,'{"targets":{"1B":{"notes":"Stay near first, give the batter-runner a lane, and watch the touch of the bag. Be ready for a possible back pick."},"SS":{"notes":"Cover second for this ball on the 2B side. Give the runner a lane and direct 2B with a clear through, cut, or hold call. For a ball on the SS side, become the cut/relay instead."},"2B":{"notes":"For this single on the 2B side, line up between CF and second as the cut/relay. For a ball on the SS side, cover second instead. Let an accurate throw travel through toward second; cut and relay, redirect, or hold when SS calls for it."}},"seqNote":"Routine single to CF on the 2B side, bases empty, 0 outs. CF fields on the ground; 2B is the cutoff and SS covers second. Second is the target, two bases ahead of the batter. Throw through the cutoff toward the target; redirect or hold when the play changes. The batter stops at first. Coverage and backups begin at contact."}'), revision=revision+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='BD-02' AND library_scope='global';

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
