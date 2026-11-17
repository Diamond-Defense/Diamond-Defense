-- Keep the original Global entries and ensure older imports have a current snapshot.
INSERT OR IGNORE INTO situation_versions (situation_key, revision, title, category, difficulty, payload_json, created_at)
SELECT key, revision, title, category, difficulty_level, payload_json, updated_at
FROM situations WHERE library_scope = 'global' AND active = 1;

-- Convert proven legacy access to revision-pinned availability, including
-- selections a coach already removed. Do not grant access to other teams.
WITH legacy_access AS (
  SELECT team_id, situation_key, NULL AS revision
  FROM team_playbook_situations WHERE adopted_revision IS NULL
  UNION
  SELECT entity_id, json_extract(before_json, '$.key'), json_extract(before_json, '$.revision')
  FROM audit_log WHERE entity_type = 'team-playbook' AND action = 'remove_adoption'
  UNION
  SELECT audit.entity_id, json_extract(selection.value, '$.situation_key'), NULL
  FROM audit_log audit, json_each(audit.before_json) selection
  WHERE audit.entity_type = 'team-playbook' AND audit.action = 'update'
    AND json_type(audit.before_json) = 'array'
)
INSERT OR IGNORE INTO situation_distributions
  (source_key, source_revision, destination_scope, destination_id, distributed_at)
SELECT s.key, COALESCE(v.revision, s.revision), 'team', a.team_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM legacy_access a
JOIN teams t ON t.id = a.team_id AND t.active = 1
JOIN situations s ON s.key = a.situation_key AND s.active = 1 AND s.library_scope = 'global'
LEFT JOIN situation_versions v ON v.situation_key = s.key AND v.revision = a.revision;

UPDATE team_playbook_state SET revision = revision + 1
WHERE team_id IN (
  SELECT p.team_id FROM team_playbook_situations p
  JOIN situations s ON s.key = p.situation_key
  WHERE p.adopted_revision IS NULL AND s.library_scope = 'global'
);

-- Coaches choose what to restore to free play through Add situations.
DELETE FROM team_playbook_situations
WHERE adopted_revision IS NULL
  AND situation_key IN (SELECT key FROM situations WHERE library_scope = 'global');
