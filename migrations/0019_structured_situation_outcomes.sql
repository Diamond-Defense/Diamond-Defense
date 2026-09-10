PRAGMA foreign_keys = ON;

-- Structured play outcomes are authoritative for new runner logic. The legacy
-- payload remains temporarily so older clients and historical data can continue
-- to load while the editor and game engine move to these relational records.
CREATE TABLE IF NOT EXISTS situation_play_outcomes (
  situation_key TEXT PRIMARY KEY,
  play_result TEXT NOT NULL CHECK (play_result IN (
    'single', 'double', 'triple', 'home_run', 'ground_rule_double',
    'groundout', 'caught_fly', 'caught_line', 'sacrifice_bunt',
    'squeeze_bunt', 'sacrifice_fly', 'fielders_choice', 'double_play',
    'error', 'other'
  )),
  batter_result TEXT NOT NULL CHECK (batter_result IN ('out', 'first', 'second', 'third', 'home')),
  outs_recorded INTEGER NOT NULL DEFAULT 0 CHECK (outs_recorded BETWEEN 0 AND 3),
  batter_out_type TEXT CHECK (batter_out_type IS NULL OR batter_out_type IN ('force', 'tag', 'catch', 'batter_first', 'other')),
  batter_out_order INTEGER CHECK (batter_out_order IS NULL OR batter_out_order BETWEEN 1 AND 3),
  review_status TEXT NOT NULL DEFAULT 'ready' CHECK (review_status IN ('ready', 'needs_review')),
  FOREIGN KEY (situation_key) REFERENCES situations(key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS situation_runner_outcomes (
  situation_key TEXT NOT NULL,
  starting_base TEXT NOT NULL CHECK (starting_base IN ('first', 'second', 'third')),
  runner_result TEXT NOT NULL CHECK (runner_result IN ('hold', 'second', 'third', 'home', 'out')),
  out_type TEXT CHECK (out_type IS NULL OR out_type IN ('force', 'tag', 'catch', 'batter_first', 'other')),
  out_order INTEGER CHECK (out_order IS NULL OR out_order BETWEEN 1 AND 3),
  tagged_up INTEGER NOT NULL DEFAULT 0 CHECK (tagged_up IN (0, 1)),
  PRIMARY KEY (situation_key, starting_base),
  FOREIGN KEY (situation_key) REFERENCES situation_play_outcomes(situation_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS situation_version_play_outcomes (
  situation_key TEXT NOT NULL,
  situation_revision INTEGER NOT NULL,
  play_result TEXT NOT NULL CHECK (play_result IN (
    'single', 'double', 'triple', 'home_run', 'ground_rule_double',
    'groundout', 'caught_fly', 'caught_line', 'sacrifice_bunt',
    'squeeze_bunt', 'sacrifice_fly', 'fielders_choice', 'double_play',
    'error', 'other'
  )),
  batter_result TEXT NOT NULL CHECK (batter_result IN ('out', 'first', 'second', 'third', 'home')),
  outs_recorded INTEGER NOT NULL DEFAULT 0 CHECK (outs_recorded BETWEEN 0 AND 3),
  batter_out_type TEXT CHECK (batter_out_type IS NULL OR batter_out_type IN ('force', 'tag', 'catch', 'batter_first', 'other')),
  batter_out_order INTEGER CHECK (batter_out_order IS NULL OR batter_out_order BETWEEN 1 AND 3),
  review_status TEXT NOT NULL DEFAULT 'ready' CHECK (review_status IN ('ready', 'needs_review')),
  PRIMARY KEY (situation_key, situation_revision),
  FOREIGN KEY (situation_key, situation_revision)
    REFERENCES situation_versions(situation_key, revision) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS situation_version_runner_outcomes (
  situation_key TEXT NOT NULL,
  situation_revision INTEGER NOT NULL,
  starting_base TEXT NOT NULL CHECK (starting_base IN ('first', 'second', 'third')),
  runner_result TEXT NOT NULL CHECK (runner_result IN ('hold', 'second', 'third', 'home', 'out')),
  out_type TEXT CHECK (out_type IS NULL OR out_type IN ('force', 'tag', 'catch', 'batter_first', 'other')),
  out_order INTEGER CHECK (out_order IS NULL OR out_order BETWEEN 1 AND 3),
  tagged_up INTEGER NOT NULL DEFAULT 0 CHECK (tagged_up IN (0, 1)),
  PRIMARY KEY (situation_key, situation_revision, starting_base),
  FOREIGN KEY (situation_key, situation_revision)
    REFERENCES situation_version_play_outcomes(situation_key, situation_revision) ON DELETE CASCADE
);

INSERT OR IGNORE INTO situation_play_outcomes
  (situation_key, play_result, batter_result, outs_recorded,
   batter_out_type, batter_out_order, review_status)
SELECT key,
       CASE
         WHEN lower(title) LIKE '%squeeze%' THEN 'squeeze_bunt'
         WHEN lower(title) LIKE '%bunt%' THEN 'sacrifice_bunt'
         WHEN lower(category) LIKE '%ground-rule%' THEN 'ground_rule_double'
         WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) = 1 THEN 'single'
         WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) = 2 THEN 'double'
         WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) = 3 THEN 'triple'
         WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) >= 4 THEN 'home_run'
         WHEN json_extract(payload_json, '$.hitType') = 'grounder' THEN 'groundout'
         WHEN json_extract(payload_json, '$.hitType') = 'popup' THEN 'caught_fly'
         WHEN json_extract(payload_json, '$.hitType') = 'line' THEN 'caught_line'
         ELSE 'other'
       END,
       CASE CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER)
         WHEN 1 THEN 'first' WHEN 2 THEN 'second' WHEN 3 THEN 'third'
         WHEN 4 THEN 'home' ELSE 'out' END,
       CASE WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) = 0 THEN 1 ELSE 0 END,
       CASE
         WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) <> 0 THEN NULL
         WHEN json_extract(payload_json, '$.hitType') IN ('line', 'popup') THEN 'catch'
         WHEN json_extract(payload_json, '$.hitType') = 'grounder' OR lower(title) LIKE '%bunt%' THEN 'batter_first'
         ELSE 'other' END,
       CASE WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) = 0 THEN 1 ELSE NULL END,
       CASE WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) BETWEEN 1 AND 4
              THEN 'ready' ELSE 'needs_review' END
  FROM situations;

INSERT OR IGNORE INTO situation_runner_outcomes
  (situation_key, starting_base, runner_result, tagged_up)
SELECT key, starting_base,
       CASE
         WHEN advance = 0 THEN 'hold'
         WHEN starting_base = 'first' AND advance = 1 THEN 'second'
         WHEN starting_base = 'first' AND advance = 2 THEN 'third'
         WHEN starting_base = 'second' AND advance = 1 THEN 'third'
         ELSE 'home' END,
       0
  FROM (
    SELECT key, payload_json,
           CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) AS advance,
           'first' AS starting_base FROM situations WHERE json_extract(payload_json, '$.runnersOn.first') = 1
    UNION ALL
    SELECT key, payload_json,
           CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER),
           'second' FROM situations WHERE json_extract(payload_json, '$.runnersOn.second') = 1
    UNION ALL
    SELECT key, payload_json,
           CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER),
           'third' FROM situations WHERE json_extract(payload_json, '$.runnersOn.third') = 1
  );

INSERT OR IGNORE INTO situation_version_play_outcomes
  (situation_key, situation_revision, play_result, batter_result, outs_recorded,
   batter_out_type, batter_out_order, review_status)
SELECT situation_key, revision,
       CASE
         WHEN lower(title) LIKE '%squeeze%' THEN 'squeeze_bunt'
         WHEN lower(title) LIKE '%bunt%' THEN 'sacrifice_bunt'
         WHEN lower(category) LIKE '%ground-rule%' THEN 'ground_rule_double'
         WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) = 1 THEN 'single'
         WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) = 2 THEN 'double'
         WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) = 3 THEN 'triple'
         WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) >= 4 THEN 'home_run'
         WHEN json_extract(payload_json, '$.hitType') = 'grounder' THEN 'groundout'
         WHEN json_extract(payload_json, '$.hitType') = 'popup' THEN 'caught_fly'
         WHEN json_extract(payload_json, '$.hitType') = 'line' THEN 'caught_line'
         ELSE 'other' END,
       CASE CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER)
         WHEN 1 THEN 'first' WHEN 2 THEN 'second' WHEN 3 THEN 'third'
         WHEN 4 THEN 'home' ELSE 'out' END,
       CASE WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) = 0 THEN 1 ELSE 0 END,
       CASE
         WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) <> 0 THEN NULL
         WHEN json_extract(payload_json, '$.hitType') IN ('line', 'popup') THEN 'catch'
         WHEN json_extract(payload_json, '$.hitType') = 'grounder' OR lower(title) LIKE '%bunt%' THEN 'batter_first'
         ELSE 'other' END,
       CASE WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) = 0 THEN 1 ELSE NULL END,
       CASE WHEN CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) BETWEEN 1 AND 4
              THEN 'ready' ELSE 'needs_review' END
  FROM situation_versions;

INSERT OR IGNORE INTO situation_version_runner_outcomes
  (situation_key, situation_revision, starting_base, runner_result,
   out_type, out_order, tagged_up)
SELECT situation_key, revision, starting_base,
       CASE
         WHEN advance = 0 THEN 'hold'
         WHEN starting_base = 'first' AND advance = 1 THEN 'second'
         WHEN starting_base = 'first' AND advance = 2 THEN 'third'
         WHEN starting_base = 'second' AND advance = 1 THEN 'third'
         ELSE 'home' END,
       NULL, NULL, 0
  FROM (
    SELECT situation_key, revision,
           CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER) AS advance,
           'first' AS starting_base FROM situation_versions WHERE json_extract(payload_json, '$.runnersOn.first') = 1
    UNION ALL
    SELECT situation_key, revision,
           CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER),
           'second' FROM situation_versions WHERE json_extract(payload_json, '$.runnersOn.second') = 1
    UNION ALL
    SELECT situation_key, revision,
           CAST(COALESCE(json_extract(payload_json, '$.batterAdvance'), 0) AS INTEGER),
           'third' FROM situation_versions WHERE json_extract(payload_json, '$.runnersOn.third') = 1
  );

CREATE INDEX IF NOT EXISTS idx_situation_outcomes_review
  ON situation_play_outcomes(review_status, situation_key);
CREATE INDEX IF NOT EXISTS idx_situation_version_outcomes
  ON situation_version_play_outcomes(situation_key, situation_revision);
