ALTER TABLE situations ADD COLUMN library_scope TEXT NOT NULL DEFAULT 'global'
  CHECK (library_scope IN ('global', 'organization', 'region', 'team'));
ALTER TABLE situations ADD COLUMN library_id TEXT NOT NULL DEFAULT '';
ALTER TABLE situations ADD COLUMN lineage_key TEXT;
ALTER TABLE situations ADD COLUMN source_situation_key TEXT;
ALTER TABLE situations ADD COLUMN source_situation_revision INTEGER;
ALTER TABLE situations ADD COLUMN promotion_revision INTEGER;

CREATE INDEX situations_library_scope ON situations(library_scope, library_id, active);
CREATE UNIQUE INDEX situations_library_lineage ON situations(library_scope, library_id, lineage_key)
  WHERE lineage_key IS NOT NULL AND active = 1;
DROP INDEX IF EXISTS situations_active_identity;
CREATE UNIQUE INDEX situations_scope_identity ON situations(library_scope, library_id, identity_key)
  WHERE active = 1 AND identity_key IS NOT NULL AND identity_key <> '';

CREATE TABLE situation_promotions (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  destination_scope TEXT NOT NULL CHECK(destination_scope IN ('region', 'organization', 'global')),
  destination_id TEXT NOT NULL,
  submitted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  destination_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'kept')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  UNIQUE(source_key, source_revision, destination_scope, destination_id),
  FOREIGN KEY(source_key, source_revision) REFERENCES situation_versions(situation_key, revision) ON DELETE RESTRICT
);

CREATE TABLE situation_distributions (
  source_key TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  destination_scope TEXT NOT NULL CHECK(destination_scope IN ('region', 'team')),
  destination_id TEXT NOT NULL,
  distributed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  distributed_at TEXT NOT NULL,
  PRIMARY KEY(source_key, source_revision, destination_scope, destination_id),
  FOREIGN KEY(source_key, source_revision) REFERENCES situation_versions(situation_key, revision) ON DELETE RESTRICT
);

ALTER TABLE team_playbook_situations ADD COLUMN adopted_revision INTEGER;
