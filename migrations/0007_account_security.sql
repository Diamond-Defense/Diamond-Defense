ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1));
ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN password_changed_at TEXT;

ALTER TABLE sessions ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT '';
UPDATE sessions SET last_seen_at = created_at WHERE last_seen_at = '';

CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until);
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen_at);
