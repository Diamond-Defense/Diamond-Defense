-- Correct the title-only grouping introduced in 0027. This is a one-time regrouping;
-- subsequent deletion/reordering still preserves letters within each starting state.
DROP TRIGGER situation_variation_insert;
DROP TRIGGER situation_variation_rename;
DROP VIEW situation_variation_groups;
CREATE VIEW situation_variation_groups AS
WITH starting_state AS (
 SELECT key, title, library_order, payload_json,
   (CASE WHEN json_extract(payload_json, '$.runnersOn.first') THEN 1 ELSE 0 END
    + CASE WHEN json_extract(payload_json, '$.runnersOn.second') THEN 2 ELSE 0 END
    + CASE WHEN json_extract(payload_json, '$.runnersOn.third') THEN 4 ELSE 0 END) AS bases
 FROM situations
), suffixes AS (
 SELECT *, ' — ' || CASE bases
  WHEN 0 THEN 'Bases Empty'
  WHEN 1 THEN 'Runner on First'
  WHEN 2 THEN 'Runner on Second'
  WHEN 3 THEN 'Runners on First and Second'
  WHEN 4 THEN 'Runner on Third'
  WHEN 5 THEN 'Runners on First and Third'
  WHEN 6 THEN 'Runners on Second and Third'
  WHEN 7 THEN 'Bases Loaded'
 END AS suffix FROM starting_state
)
SELECT key, library_order,
 json_array('starting-state-v2',
   lower(trim(CASE WHEN substr(title, -length(suffix)) = suffix
     THEN substr(title, 1, length(title)-length(suffix)) ELSE title END)),
   bases, CAST(COALESCE(json_extract(payload_json, '$.outs'),0) AS INTEGER),
   COALESCE(json_extract(payload_json, '$.hitType'),''),
   COALESCE(NULLIF(json_extract(payload_json, '$.ballLocation'),''),
     'point:' || CAST(round(COALESCE(json_extract(payload_json,'$.hit.x'),0)*1000) AS INTEGER)
     || ',' || CAST(round(COALESCE(json_extract(payload_json,'$.hit.y'),0)*1000) AS INTEGER))
 ) AS name_group
FROM suffixes;

-- Existing situations start at A in their corrected group, in existing library order.
-- Old title-only reservations remain for auditability, but are no longer used.
INSERT INTO situation_variation_tags(name_group, situation_key, ordinal)
SELECT name_group, key, ROW_NUMBER() OVER (PARTITION BY name_group ORDER BY library_order, key)
FROM situation_variation_groups;

CREATE TRIGGER situation_variation_insert AFTER INSERT ON situations BEGIN
 INSERT OR IGNORE INTO situation_variation_tags(name_group, situation_key, ordinal)
 SELECT g.name_group, NEW.key, COALESCE((SELECT MAX(ordinal) FROM situation_variation_tags t WHERE t.name_group=g.name_group),0)+1
 FROM situation_variation_groups g WHERE g.key=NEW.key;
END;
CREATE TRIGGER situation_variation_rename AFTER UPDATE OF title, payload_json ON situations BEGIN
 INSERT OR IGNORE INTO situation_variation_tags(name_group, situation_key, ordinal)
 SELECT g.name_group, NEW.key, COALESCE((SELECT MAX(ordinal) FROM situation_variation_tags t WHERE t.name_group=g.name_group),0)+1
 FROM situation_variation_groups g WHERE g.key=NEW.key;
END;
