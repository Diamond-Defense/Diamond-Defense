CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0)
);

CREATE TABLE regions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0)
);
CREATE UNIQUE INDEX regions_organization_name ON regions(organization_id, name COLLATE NOCASE);

ALTER TABLE teams ADD COLUMN region_id TEXT REFERENCES regions(id) ON DELETE RESTRICT;
CREATE INDEX teams_region ON teams(region_id);

CREATE TABLE workspace_assignments (
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
    OR (role IN ('coach', 'training_manager') AND team_id IS NOT NULL AND organization_id IS NULL AND region_id IS NULL)
  ),
  CHECK (role <> 'training_manager' OR can_design = 0)
);
CREATE UNIQUE INDEX workspace_assignments_scope ON workspace_assignments(
  user_id, role, coalesce(organization_id, ''), coalesce(region_id, ''), coalesce(team_id, '')
);

-- Stage the known scope of current access without changing live authorization.
INSERT INTO workspace_assignments (id, user_id, role, team_id)
SELECT 'coach:' || length(user_id) || ':' || user_id || ':' || team_id, user_id, 'coach', team_id
FROM team_memberships WHERE active = 1 AND team_role = 'coach';

INSERT INTO workspace_assignments (id, user_id, role, team_id)
SELECT 'training:' || length(user_id) || ':' || user_id || ':' || team_id, user_id, 'training_manager', team_id
FROM coach_team_access a
WHERE NOT EXISTS (
  SELECT 1 FROM team_memberships m WHERE m.user_id = a.user_id AND m.team_id = a.team_id
    AND m.active = 1 AND m.team_role = 'coach'
);
