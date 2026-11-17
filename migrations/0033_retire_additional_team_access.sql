-- Keep a record of retired grants without assigning new roles or scopes.
INSERT INTO audit_log (id, action, entity_type, entity_id, before_json, created_at)
SELECT lower(hex(randomblob(16))), 'retire_additional_team_access', 'user', user_id,
       json_object('userId', user_id, 'teamId', team_id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM coach_team_access;

CREATE TABLE workspace_assignments_current (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  region_id TEXT REFERENCES regions(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
  can_design INTEGER NOT NULL DEFAULT 0 CHECK (can_design IN (0, 1)),
  CHECK (
    (role = 'organization_director' AND organization_id IS NOT NULL AND region_id IS NULL AND team_id IS NULL)
    OR (role = 'regional_director' AND region_id IS NOT NULL AND organization_id IS NULL AND team_id IS NULL)
    OR (role = 'coach' AND team_id IS NOT NULL AND organization_id IS NULL AND region_id IS NULL)
  )
);

INSERT INTO workspace_assignments_current (id, user_id, role, organization_id, region_id, team_id, can_design)
SELECT id, user_id, role, organization_id, region_id, team_id, can_design
FROM workspace_assignments WHERE role IN ('coach', 'organization_director', 'regional_director');

DROP TABLE workspace_assignments;
ALTER TABLE workspace_assignments_current RENAME TO workspace_assignments;

CREATE UNIQUE INDEX workspace_assignments_scope ON workspace_assignments(
  user_id, role, coalesce(organization_id, ''), coalesce(region_id, ''), coalesce(team_id, '')
);

DROP TABLE coach_team_access;
