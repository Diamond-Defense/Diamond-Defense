PRAGMA foreign_keys = ON;

ALTER TABLE situation_submissions
  ADD COLUMN rationale TEXT NOT NULL DEFAULT '';

ALTER TABLE situation_submissions
  ADD COLUMN accepted_fields_json TEXT NOT NULL DEFAULT '[]';
