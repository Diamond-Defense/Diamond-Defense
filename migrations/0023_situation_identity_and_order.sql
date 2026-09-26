-- Legacy rows retain NULL identity until reviewed; new publications enforce uniqueness.
ALTER TABLE situations ADD COLUMN identity_key TEXT;
ALTER TABLE situations ADD COLUMN library_order INTEGER NOT NULL DEFAULT 0;
UPDATE situations SET library_order = (SELECT COUNT(*) FROM situations s WHERE CAST(substr(s.display_code,2) AS REAL) < CAST(substr(situations.display_code,2) AS REAL));
CREATE UNIQUE INDEX situations_active_identity ON situations(identity_key) WHERE active = 1 AND identity_key IS NOT NULL;
CREATE TABLE situation_library_state (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL DEFAULT 1, token TEXT NOT NULL DEFAULT '');
INSERT INTO situation_library_state(id) VALUES(1);
CREATE TRIGGER situation_library_insert AFTER INSERT ON situations BEGIN
  UPDATE situations SET library_order = (SELECT COALESCE(MAX(library_order),0)+1 FROM situations WHERE key != NEW.key) WHERE key = NEW.key;
  UPDATE situation_library_state SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER situation_library_membership AFTER UPDATE OF active ON situations WHEN OLD.active != NEW.active BEGIN
  UPDATE situation_library_state SET revision = revision + 1 WHERE id = 1;
END;
