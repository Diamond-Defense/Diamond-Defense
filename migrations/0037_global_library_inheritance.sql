CREATE TABLE global_situation_hides (
  scope_type TEXT NOT NULL CHECK (scope_type IN ('organization', 'region', 'team')),
  scope_id TEXT NOT NULL,
  situation_key TEXT NOT NULL REFERENCES situations(key) ON DELETE CASCADE,
  PRIMARY KEY (scope_type, scope_id, situation_key)
);

CREATE TABLE team_global_difficulty (
  team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  maximum TEXT NOT NULL CHECK (maximum IN ('foundational', 'intermediate'))
);

CREATE VIEW global_library_scopes AS
SELECT 'organization' AS scope_type, id AS scope_id, id AS organization_id, NULL AS region_id FROM organizations
UNION ALL
SELECT 'region', id, organization_id, id FROM regions
UNION ALL
SELECT 'team', t.id, r.organization_id, r.id FROM teams t LEFT JOIN regions r ON r.id=t.region_id WHERE t.active=1;

CREATE VIEW global_library_visibility AS
SELECT scope.scope_type, scope.scope_id, s.key AS situation_key,
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
JOIN situations s ON s.library_scope='global' AND s.active=1
LEFT JOIN team_global_difficulty difficulty ON scope.scope_type='team' AND difficulty.team_id=scope.scope_id;

CREATE VIEW effective_team_playbook AS
SELECT p.team_id, s.key AS situation_key, COALESCE(p.adopted_revision,s.revision) AS revision
FROM team_playbook_situations p JOIN situations s ON s.key=p.situation_key
WHERE s.active=1 AND s.library_scope!='global'
UNION ALL
SELECT visibility.scope_id, s.key, s.revision
FROM global_library_visibility visibility JOIN situations s ON s.key=visibility.situation_key
WHERE visibility.scope_type='team' AND visibility.hidden_scope IS NULL AND visibility.filtered=0;

CREATE VIEW team_assignable_situations AS
SELECT team_id, situation_key, revision FROM effective_team_playbook
UNION ALL
SELECT d.destination_id, d.source_key, MAX(d.source_revision)
FROM situation_distributions d JOIN situations s ON s.key=d.source_key
WHERE d.destination_scope='team' AND s.active=1 AND s.library_scope!='global'
  AND NOT EXISTS (
    SELECT 1 FROM team_playbook_situations p WHERE p.team_id=d.destination_id AND p.situation_key=d.source_key
  )
GROUP BY d.destination_id,d.source_key;
