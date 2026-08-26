import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSituationSeedSql } from './lib/situation-seed.mjs';

test('builds an idempotent situation-only seed', () => {
  const sql = buildSituationSeedSql(
    [{ key: 'BD-01', title: "Coach's Choice", desc: 'Single to LF' }],
    '2026-08-26T12:00:00.000Z',
  );

  assert.match(sql, /INSERT INTO situations/);
  assert.match(sql, /ON CONFLICT\(key\) DO UPDATE/);
  assert.match(sql, /Coach''s Choice/);
  assert.match(sql, /archived_at=NULL, archived_by=NULL/);
  assert.doesNotMatch(sql, /INSERT INTO (users|teams|team_memberships)/);
});

test('rejects empty and duplicate situation collections', () => {
  assert.throws(() => buildSituationSeedSql([]), /at least one situation/i);
  assert.throws(
    () => buildSituationSeedSql([{ key: 'BD-01' }, { key: 'BD-01' }]),
    /duplicate situation key/i,
  );
});
