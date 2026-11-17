CREATE TABLE situation_library_links (
  scope_type TEXT NOT NULL CHECK(scope_type IN ('region','organization')),
  scope_id TEXT NOT NULL,
  situation_key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  PRIMARY KEY(scope_type,scope_id,situation_key),
  FOREIGN KEY(situation_key,revision) REFERENCES situation_versions(situation_key,revision) ON DELETE RESTRICT
);

CREATE TABLE situation_change_proposals (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  author_scope TEXT NOT NULL CHECK(author_scope IN ('global','organization','region','team')),
  author_scope_id TEXT NOT NULL,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(source_key,source_revision) REFERENCES situation_versions(situation_key,revision) ON DELETE RESTRICT
);
CREATE INDEX situation_change_proposals_queue ON situation_change_proposals(source_key,status);
