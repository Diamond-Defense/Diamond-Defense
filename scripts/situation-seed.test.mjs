import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSituationSeedSql } from './lib/situation-seed.mjs';

test('builds an idempotent situation-only seed', () => {
  const sql = buildSituationSeedSql(
    [{ key: 'BD-01', title: "Coach's Choice", desc: 'Single to LF' }],
    '2026-08-26T12:00:00.000Z',
  );

  assert.match(sql, /INSERT INTO situations/);
  assert.match(sql, /key, display_code, title/);
  assert.match(sql, /'BD-01', 'S01'/);
  assert.match(sql, /category, difficulty, difficulty_level/);
  assert.match(sql, /'Singles', 'beginner', 'foundational'/);
  assert.match(sql, /INSERT OR IGNORE INTO teaching_categories/);
  assert.match(sql, /INSERT INTO situation_teaching_categories/);
  assert.match(sql, /'cutoffs-relays', 1/);
  assert.match(sql, /ON CONFLICT\(key\) DO UPDATE/);
  assert.match(sql, /display_code=COALESCE\(situations\.display_code, excluded\.display_code\)/);
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
