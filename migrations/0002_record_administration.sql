ALTER TABLE teams ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE teams ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));
ALTER TABLE teams ADD COLUMN archived_at TEXT;
ALTER TABLE teams ADD COLUMN archived_by TEXT;

ALTER TABLE users ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN archived_at TEXT;
ALTER TABLE users ADD COLUMN archived_by TEXT;

ALTER TABLE team_memberships ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE team_memberships ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));
ALTER TABLE team_memberships ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE team_memberships ADD COLUMN archived_at TEXT;
ALTER TABLE team_memberships ADD COLUMN archived_by TEXT;

UPDATE team_memberships SET updated_at = created_at WHERE updated_at = '';

ALTER TABLE situations ADD COLUMN archived_at TEXT;
ALTER TABLE situations ADD COLUMN archived_by TEXT;

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_teams_active ON teams(active, name);
CREATE INDEX IF NOT EXISTS idx_memberships_team_active ON team_memberships(team_id, active);
CREATE INDEX IF NOT EXISTS idx_users_active_role ON users(active, role);
CREATE INDEX IF NOT EXISTS idx_situations_active_key ON situations(active, key);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_user_id, created_at DESC);
