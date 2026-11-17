DROP VIEW team_assignable_situations;
DROP VIEW effective_team_playbook;
DROP VIEW global_library_visibility;

CREATE VIEW library_inheritance AS
SELECT scope.scope_type, scope.scope_id, s.key AS situation_key, s.library_scope AS source_type, s.library_id AS source_id,
  CASE WHEN scope.scope_type='team' AND EXISTS (
    SELECT 1 FROM global_situation_hides h WHERE h.scope_type='team' AND h.scope_id=scope.scope_id AND h.situation_key=s.key
  ) THEN 'team'
  WHEN scope.scope_type IN ('team','region') AND EXISTS (
    SELECT 1 FROM global_situation_hides h WHERE h.scope_type='region' AND h.scope_id=scope.region_id AND h.situation_key=s.key
  ) THEN 'region'
  WHEN EXISTS (
    SELECT 1 FROM global_situation_hides h WHERE h.scope_type='organization' AND h.scope_id=scope.organization_id AND h.situation_key=s.key
  ) THEN 'organization'
  END AS hidden_scope,
  CASE WHEN (difficulty.maximum='foundational' AND s.difficulty_level!='foundational')
          OR (difficulty.maximum='intermediate' AND s.difficulty_level='advanced')
       THEN 1 ELSE 0 END AS filtered
FROM global_library_scopes scope
JOIN situations s ON s.active=1 AND (
  s.library_scope='global'
  OR (scope.scope_type IN ('region','team') AND s.library_scope='organization' AND s.library_id=scope.organization_id)
  OR (scope.scope_type='team' AND s.library_scope='region' AND s.library_id=scope.region_id)
)
LEFT JOIN team_global_difficulty difficulty ON scope.scope_type='team' AND difficulty.team_id=scope.scope_id;

CREATE VIEW effective_team_playbook AS
SELECT s.library_id AS team_id, s.key AS situation_key, s.revision
FROM situations s
WHERE s.active=1 AND s.library_scope='team'
UNION ALL
SELECT inheritance.scope_id, s.key, s.revision
FROM library_inheritance inheritance JOIN situations s ON s.key=inheritance.situation_key
WHERE inheritance.scope_type='team' AND inheritance.hidden_scope IS NULL AND inheritance.filtered=0;

CREATE VIEW team_assignable_situations AS
SELECT team_id, situation_key, revision FROM effective_team_playbook;
