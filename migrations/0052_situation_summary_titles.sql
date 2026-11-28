-- Short titles describe the batted ball. Stable IDs and starting-state metadata
-- distinguish repeats. Preserve named variants separately and retain all prior versions.
CREATE TABLE _migration_0052_situation_titles AS
SELECT key, title AS old_title,
 CASE WHEN instr(title,' — ')>0 THEN substr(title,1,instr(title,' — ')-1) ELSE title END AS new_title,
 CASE WHEN instr(lower(title),' — variation')>0 THEN substr(title,instr(lower(title),' — variation')+3) ELSE '' END AS variant
FROM situations WHERE title GLOB 'Line Drive to *' OR title GLOB 'Ground Ball to *' OR title GLOB 'Fly Ball to *' OR title GLOB 'Pop Fly to *';
UPDATE _migration_0052_situation_titles SET new_title=replace(replace(new_title,' to Shallow ',' to '),' to Deep ',' to ');
DELETE FROM _migration_0052_situation_titles WHERE old_title=new_title;
UPDATE situations SET
 title=(SELECT new_title FROM _migration_0052_situation_titles u WHERE u.key=situations.key),
 payload_json=json_set(
   CASE WHEN (SELECT variant FROM _migration_0052_situation_titles u WHERE u.key=situations.key)<>''
    AND COALESCE(json_extract(payload_json,'$.audience.staffVariant'),'')=''
   THEN json_set(payload_json,'$.audience',json(COALESCE(json_extract(payload_json,'$.audience'),'{}')),
    '$.audience.staffVariant',(SELECT variant FROM _migration_0052_situation_titles u WHERE u.key=situations.key))
   ELSE payload_json END,
   '$.title',(SELECT new_title FROM _migration_0052_situation_titles u WHERE u.key=situations.key)),
 revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE key IN (SELECT key FROM _migration_0052_situation_titles);

INSERT OR IGNORE INTO situation_versions
  (situation_key, revision, title, category, difficulty, payload_json, created_at)
SELECT key, revision, title, category, difficulty_level, payload_json, updated_at
  FROM situations
 WHERE key IN (SELECT key FROM _migration_0052_situation_titles);

INSERT OR IGNORE INTO situation_version_teaching_categories
  (situation_key, situation_revision, category_id, is_primary, sort_order)
SELECT stc.situation_key, s.revision, stc.category_id, stc.is_primary, stc.sort_order
  FROM situation_teaching_categories stc
  JOIN situations s ON s.key = stc.situation_key
 WHERE stc.situation_key IN (SELECT key FROM _migration_0052_situation_titles);

INSERT OR IGNORE INTO situation_version_play_outcomes
  (situation_key, situation_revision, play_result, batter_result,
   outs_recorded, batter_out_type, batter_out_order, review_status)
SELECT spo.situation_key, s.revision, spo.play_result, spo.batter_result,
       spo.outs_recorded, spo.batter_out_type, spo.batter_out_order, spo.review_status
  FROM situation_play_outcomes spo
  JOIN situations s ON s.key = spo.situation_key
 WHERE spo.situation_key IN (SELECT key FROM _migration_0052_situation_titles);

INSERT OR IGNORE INTO situation_version_runner_outcomes
  (situation_key, situation_revision, starting_base, runner_result,
   out_type, out_order, tagged_up)
SELECT sro.situation_key, s.revision, sro.starting_base, sro.runner_result,
       sro.out_type, sro.out_order, sro.tagged_up
  FROM situation_runner_outcomes sro
  JOIN situations s ON s.key = sro.situation_key
 WHERE sro.situation_key IN (SELECT key FROM _migration_0052_situation_titles);

DROP TABLE _migration_0052_situation_titles;
