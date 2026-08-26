import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  IMPORT_TABLES,
  buildReplacementSql,
  buildValidationSql,
  confirmationPhrase,
  createPasswordRecord,
  parseRefreshArguments,
  productionDataFromExport,
  validateRefreshResult,
} from './lib/database-refresh.mjs';

const exportSql = `PRAGMA defer_foreign_keys=TRUE;
INSERT INTO "users" ("id","role") VALUES('player-one','player');
INSERT INTO "teams" ("id") VALUES('team-one');
INSERT INTO "team_memberships" ("team_id","user_id") VALUES('team-one','player-one');
INSERT INTO "situations" ("key") VALUES('BD-01');
INSERT INTO "attempts" ("id") VALUES('attempt-one');
INSERT INTO "situation_submissions" ("id") VALUES('submission-one');
`;

test('accepts only preview and local refresh targets', () => {
  assert.deepEqual(parseRefreshArguments(['--target', 'preview', '--anonymize-players']), {
    target: 'preview', anonymizePlayers: true, dryRun: false, confirmation: null, help: false,
  });
  assert.equal(parseRefreshArguments(['--target', 'local', '--dry-run']).dryRun, true);
  assert.throws(() => parseRefreshArguments(['--target', 'production']), /never a refresh target/i);
  assert.equal(confirmationPhrase('preview'), 'REFRESH PREVIEW');
  assert.equal(confirmationPhrase('local'), 'REFRESH LOCAL');
});

test('creates a verifiable password record without retaining plaintext', () => {
  const password = 'a safe nonproduction password';
  const salt = Buffer.alloc(16, 7);
  const record = createPasswordRecord(password, salt);
  assert.equal(record.hash, pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('base64'));
  assert.equal(record.iterations, 100000);
  assert.throws(() => createPasswordRecord('too short'), /at least 12/);
});

test('allows only approved production tables and refuses an empty core export', () => {
  const parsed = productionDataFromExport(exportSql);
  assert.equal(parsed.counts.users, 1);
  assert.deepEqual(Object.keys(parsed.counts), IMPORT_TABLES);
  assert.throws(
    () => productionDataFromExport(`${exportSql}INSERT INTO "sessions" ("token_hash") VALUES('secret');`),
    /unexpectedly included table sessions/,
  );
  assert.throws(
    () => productionDataFromExport(exportSql.replace(/INSERT INTO "users"[^\n]+\n/, '')),
    /contains no users/,
  );
});

test('replacement SQL preserves migrations and strips sensitive target state', () => {
  const password = 'a safe nonproduction password';
  const record = createPasswordRecord(password, Buffer.alloc(16, 3));
  const { sql, counts } = buildReplacementSql(exportSql, record, { anonymizePlayers: true });
  assert.equal(counts.attempts, 1);
  assert.match(sql, /DELETE FROM "sessions"/);
  assert.match(sql, /DELETE FROM "audit_log"/);
  assert.doesNotMatch(sql, /DELETE FROM "d1_migrations"/);
  assert.doesNotMatch(sql, new RegExp(password));
  assert.match(sql, /@example\.invalid/);
  assert.match(sql, /nonprod-player-/);
  assert.match(sql, /UPDATE attempts/);
});

test('post-import validation enforces counts, safety rules, and migration history', () => {
  const counts = Object.fromEntries(IMPORT_TABLES.map((table) => [table, 1]));
  const valid = {
    ...counts, sessions: 0, audit_log: 0, password_variants: 1,
    exposed_emails: 0, non_anonymized_players: 0, migrations: 4,
  };
  assert.doesNotThrow(() => validateRefreshResult(valid, counts, 4, true));
  assert.throws(
    () => validateRefreshResult({ ...valid, sessions: 1 }, counts, 4, true),
    /sessions or production audit/,
  );
  assert.throws(
    () => validateRefreshResult({ ...valid, migrations: 3 }, counts, 4, true),
    /migration history/,
  );
  assert.match(buildValidationSql(true), /non_anonymized_players/);
});

test('generated replacement SQL executes against the portable SQLite schema', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );`);
  for (const name of [
    '0001_initial.sql',
    '0002_record_administration.sql',
    '0003_coach_accounts_and_situation_review.sql',
    '0004_complete_attempt_lifecycle.sql',
    '0005_password_iteration_limit.sql',
  ]) {
    database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
    database.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
  }
  database.exec(`
    INSERT INTO users
      (id, username, display_name, role, password_hash, password_salt,
       password_iterations, active, created_at, updated_at)
    VALUES ('old-user', 'old-user', 'Old User', 'player', 'old', 'old',
            100000, 1, '2026-01-01', '2026-01-01');
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES ('old-session', 'old-user', '2027-01-01', '2026-01-01');
    INSERT INTO audit_log
      (id, action, entity_type, entity_id, created_at)
    VALUES ('old-audit', 'create', 'user', 'old-user', '2026-01-01');
  `);

  const executableExport = `
    INSERT INTO "users" ("id","username","display_name","role","password_hash","password_salt","password_iterations","active","created_at","updated_at","revision","archived_at","archived_by") VALUES('new-player','new-player','Real Player','player','production-hash','production-salt',100000,1,'2026-02-01','2026-02-01',1,NULL,NULL);
    INSERT INTO "teams" ("id","name","coach_email","created_at","updated_at","revision","active","archived_at","archived_by") VALUES('team-one','Team One','real@example.com','2026-02-01','2026-02-01',1,1,NULL,NULL);
    INSERT INTO "situations" ("key","title","description","payload_json","revision","active","created_by","created_at","updated_at","archived_at","archived_by") VALUES('BD-01','Situation 1','Test','{}',1,1,NULL,'2026-02-01','2026-02-01',NULL,NULL);
  `;
  const password = createPasswordRecord(
    'a safe nonproduction password',
    Buffer.alloc(16, 9),
  );
  const replacement = buildReplacementSql(executableExport, password, {
    anonymizePlayers: true,
  });
  database.exec(replacement.sql);

  assert.deepEqual(
    { ...database.prepare(`SELECT id, display_name, username, password_hash
      FROM users`).get() },
    {
      id: 'new-player',
      display_name: 'Player 001',
      username: 'nonprod-player-001',
      password_hash: password.hash,
    },
  );
  assert.equal(database.prepare('SELECT coach_email FROM teams').get().coach_email, 'team-one@example.invalid');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM audit_log').get().count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM d1_migrations').get().count, 5);
  database.close();
});
