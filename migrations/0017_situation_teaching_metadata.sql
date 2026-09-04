PRAGMA foreign_keys = ON;

-- difficulty remains for compatibility with the original schema constraint.
-- difficulty_level is the authoritative, user-facing value going forward.
ALTER TABLE situations ADD COLUMN difficulty_level TEXT NOT NULL DEFAULT 'intermediate'
  CHECK (difficulty_level IN ('foundational', 'intermediate', 'advanced'));

UPDATE situations
   SET difficulty_level = CASE difficulty
     WHEN 'beginner' THEN 'foundational'
     WHEN 'advanced' THEN 'advanced'
     ELSE 'intermediate'
   END;

UPDATE situation_versions
   SET difficulty = CASE difficulty
     WHEN 'beginner' THEN 'foundational'
     ELSE difficulty
   END;

CREATE INDEX IF NOT EXISTS idx_situations_browse_v2
  ON situations(active, difficulty_level, key);

CREATE TABLE IF NOT EXISTS teaching_categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

INSERT OR IGNORE INTO teaching_categories (id, label, sort_order) VALUES
  ('cutoffs-relays', 'Cutoffs & Relays', 10),
  ('backups-rotations', 'Backups & Rotations', 20),
  ('force-plays', 'Force Plays', 30),
  ('fly-ball-priority', 'Fly-Ball Priority', 40),
  ('rundowns', 'Rundowns', 50),
  ('bunt-defense', 'Bunt Defense', 60),
  ('first-third-defense', 'First-and-Third Defense', 70),
  ('double-plays', 'Double Plays', 80),
  ('base-coverage', 'Base Coverage', 90),
  ('pitcher-catcher-responsibilities', 'Pitcher & Catcher Responsibilities', 100),
  ('tag-ups-sacrifice-flies', 'Tag-Ups & Sacrifice Flies', 110),
  ('situational-alignment', 'Situational Alignment', 120);

CREATE TABLE IF NOT EXISTS situation_teaching_categories (
  situation_key TEXT NOT NULL,
  category_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (situation_key, category_id),
  FOREIGN KEY (situation_key) REFERENCES situations(key) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES teaching_categories(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_situation_one_primary_category
  ON situation_teaching_categories(situation_key) WHERE is_primary = 1;
CREATE INDEX IF NOT EXISTS idx_situation_categories_browse
  ON situation_teaching_categories(category_id, is_primary, situation_key);

CREATE TABLE IF NOT EXISTS situation_version_teaching_categories (
  situation_key TEXT NOT NULL,
  situation_revision INTEGER NOT NULL,
  category_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (situation_key, situation_revision, category_id),
  FOREIGN KEY (situation_key, situation_revision)
    REFERENCES situation_versions(situation_key, revision) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES teaching_categories(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_situation_version_one_primary_category
  ON situation_version_teaching_categories(situation_key, situation_revision)
  WHERE is_primary = 1;

-- The current library teaches outfield cutoffs/relays. Backups and base coverage
-- are related responsibilities within every existing situation.
INSERT OR IGNORE INTO situation_teaching_categories
  (situation_key, category_id, is_primary, sort_order)
SELECT key, 'cutoffs-relays', 1, 0 FROM situations;
INSERT OR IGNORE INTO situation_teaching_categories
  (situation_key, category_id, is_primary, sort_order)
SELECT key, 'backups-rotations', 0, 1 FROM situations;
INSERT OR IGNORE INTO situation_teaching_categories
  (situation_key, category_id, is_primary, sort_order)
SELECT key, 'base-coverage', 0, 2 FROM situations;

INSERT OR IGNORE INTO situation_version_teaching_categories
  (situation_key, situation_revision, category_id, is_primary, sort_order)
SELECT sv.situation_key, sv.revision, stc.category_id, stc.is_primary, stc.sort_order
  FROM situation_versions sv
  JOIN situation_teaching_categories stc ON stc.situation_key = sv.situation_key;
