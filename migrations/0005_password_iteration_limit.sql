-- Cloudflare Workers supports PBKDF2 iteration counts up to 100,000. Application
-- code always writes the iteration count explicitly; these triggers protect the
-- portable SQLite data if another administration path writes users directly.
CREATE TRIGGER IF NOT EXISTS users_password_iterations_limit_insert
BEFORE INSERT ON users
WHEN NEW.password_iterations < 1 OR NEW.password_iterations > 100000
BEGIN
  SELECT RAISE(ABORT, 'password_iterations must be between 1 and 100000');
END;

CREATE TRIGGER IF NOT EXISTS users_password_iterations_limit_update
BEFORE UPDATE OF password_iterations ON users
WHEN NEW.password_iterations < 1 OR NEW.password_iterations > 100000
BEGIN
  SELECT RAISE(ABORT, 'password_iterations must be between 1 and 100000');
END;
