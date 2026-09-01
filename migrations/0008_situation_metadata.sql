ALTER TABLE situations ADD COLUMN category TEXT NOT NULL DEFAULT 'General';
ALTER TABLE situations ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'intermediate'
  CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'));

UPDATE situations
   SET category = CASE
     WHEN key IN ('BD-13', 'BD-14', 'BD-15', 'BD-16', 'BD-17', 'BD-18', 'BD-19', 'BD-20') THEN 'Extra-base hits'
     ELSE 'Singles'
   END;

UPDATE situations
   SET difficulty = CASE
     WHEN key IN ('BD-01', 'BD-02', 'BD-03') THEN 'beginner'
     WHEN key IN ('BD-06', 'BD-10-2', 'BD-10-3', 'BD-11', 'BD-12', 'BD-17', 'BD-18', 'BD-19', 'BD-20') THEN 'advanced'
     ELSE 'intermediate'
   END;

CREATE INDEX IF NOT EXISTS idx_situations_browse
  ON situations(active, category, difficulty, key);
