import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_PASSWORD_ITERATIONS,
  createPasswordHash,
  verifyPassword,
} from '../src/lib/server/security/passwords.ts';

test('creates and verifies Cloudflare-compatible password hashes', async () => {
  const record = await createPasswordHash('safe test password');
  assert.equal(record.iterations, MAX_PASSWORD_ITERATIONS);
  assert.equal(
    await verifyPassword(
      'safe test password',
      record.hash,
      record.salt,
      record.iterations,
    ),
    true,
  );
  assert.equal(
    await verifyPassword('wrong password', record.hash, record.salt, record.iterations),
    false,
  );
});

test('rejects PBKDF2 iteration counts Cloudflare cannot execute', async () => {
  await assert.rejects(
    verifyPassword('safe test password', 'unused', 'unused', MAX_PASSWORD_ITERATIONS + 1),
    /between 1 and 100000/,
  );
});
