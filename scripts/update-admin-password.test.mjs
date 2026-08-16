import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import test from 'node:test';
import {
  buildUpdateSql,
  createPasswordRecord,
  parseArguments,
  validatePassword,
} from './update-admin-password.mjs';

test('parses local and remote command options', () => {
  assert.deepEqual(parseArguments([]), {
    database: 'diamond-defense',
    location: 'local',
    yes: false,
    help: false,
  });
  assert.deepEqual(
    parseArguments(['--remote', '--database', 'production-database', '--yes']),
    {
      database: 'production-database',
      location: 'remote',
      yes: true,
      help: false,
    },
  );
});

test('rejects short passwords and creates a verifiable PBKDF2 record', () => {
  assert.throws(() => validatePassword('too-short'), /at least 12/);
  const password = 'a secure test passphrase';
  const record = createPasswordRecord(password);
  const expectedHash = pbkdf2Sync(
    password,
    Buffer.from(record.salt, 'base64'),
    record.iterations,
    32,
    'sha256',
  ).toString('base64');

  assert.equal(record.hash, expectedHash);
  assert.equal(record.iterations, 120000);
});

test('builds password-free SQL scoped to the administrator account', () => {
  const password = 'never include this password';
  const record = createPasswordRecord(password);
  const sql = buildUpdateSql(record, '2026-08-16T12:00:00.000Z');

  assert.doesNotMatch(sql, new RegExp(password));
  assert.match(sql, /WHERE id = 'staff-admin' AND role = 'admin'/);
  assert.match(sql, /DELETE FROM sessions WHERE user_id = 'staff-admin'/);
  assert.match(sql, /password_iterations = 120000/);
});
