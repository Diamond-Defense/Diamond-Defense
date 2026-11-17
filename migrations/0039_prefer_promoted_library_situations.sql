DROP VIEW team_assignable_situations;
DROP VIEW effective_team_playbook;
DROP VIEW library_inheritance;

CREATE VIEW library_inheritance AS
WITH ranked AS (
  SELECT scope.*, s.key AS situation_key, s.library_scope AS source_type, s.library_id AS source_id,
    COALESCE(s.lineage_key,s.key) AS lineage, s.difficulty_level,
    ROW_NUMBER() OVER (
      PARTITION BY scope.scope_type,scope.scope_id,COALESCE(s.lineage_key,s.key)
      ORDER BY CASE s.library_scope WHEN 'global' THEN 1 WHEN 'organization' THEN 2 ELSE 3 END,s.key
    ) AS rank
  FROM global_library_scopes scope
  JOIN situations s ON s.active=1 AND (
    s.library_scope='global'
    OR (scope.scope_type IN ('region','team') AND s.library_scope='organization' AND s.library_id=scope.organization_id)
    OR (scope.scope_type='team' AND s.library_scope='region' AND s.library_id=scope.region_id)
  )
)
SELECT scope.scope_type, scope.scope_id, scope.situation_key, scope.source_type, scope.source_id, scope.lineage,
  CASE WHEN scope.scope_type='team' AND EXISTS (
    SELECT 1 FROM global_situation_hides h JOIN situations hidden ON hidden.key=h.situation_key WHERE h.scope_type='team' AND h.scope_id=scope.scope_id AND COALESCE(hidden.lineage_key,hidden.key)=scope.lineage
  ) THEN 'team'
  WHEN scope.scope_type IN ('team','region') AND EXISTS (
    SELECT 1 FROM global_situation_hides h JOIN situations hidden ON hidden.key=h.situation_key WHERE h.scope_type='region' AND h.scope_id=scope.region_id AND COALESCE(hidden.lineage_key,hidden.key)=scope.lineage
  ) THEN 'region'
  WHEN EXISTS (
    SELECT 1 FROM global_situation_hides h JOIN situations hidden ON hidden.key=h.situation_key WHERE h.scope_type='organization' AND h.scope_id=scope.organization_id AND COALESCE(hidden.lineage_key,hidden.key)=scope.lineage
  ) THEN 'organization'
  END AS hidden_scope,
  CASE WHEN (difficulty.maximum='foundational' AND scope.difficulty_level!='foundational')
          OR (difficulty.maximum='intermediate' AND scope.difficulty_level='advanced')
       THEN 1 ELSE 0 END AS filtered
FROM ranked scope
LEFT JOIN team_global_difficulty difficulty ON scope.scope_type='team' AND difficulty.team_id=scope.scope_id
WHERE scope.rank=1;

CREATE VIEW library_owned_catalog AS
SELECT s.key,s.library_scope,s.library_id
FROM situations s
WHERE s.active=1 AND NOT EXISTS (
  SELECT 1 FROM library_inheritance i
  WHERE i.scope_type=s.library_scope AND i.scope_id=s.library_id
    AND i.lineage=COALESCE(s.lineage_key,s.key)
);

CREATE VIEW effective_team_playbook AS
SELECT s.library_id AS team_id,s.key AS situation_key,s.revision
FROM situations s JOIN library_owned_catalog owned ON owned.key=s.key
WHERE s.library_scope='team'
UNION ALL
SELECT i.scope_id,s.key,s.revision
FROM library_inheritance i JOIN situations s ON s.key=i.situation_key
WHERE i.scope_type='team' AND i.hidden_scope IS NULL AND i.filtered=0;

CREATE VIEW team_assignable_situations AS
SELECT team_id, situation_key, revision FROM effective_team_playbook;
