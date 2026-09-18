import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSituationSeedSql } from './lib/situation-seed.mjs';

test('builds an idempotent situation-only seed', () => {
  const sql = buildSituationSeedSql(
    [{
      key: 'BD-01', title: "Coach's Choice", desc: 'Single to LF',
      hitType: 'line', batterAdvance: 1,
      runnersOn: { first: true, second: false, third: false },
    }],
    '2026-08-26T12:00:00.000Z',
  );

  assert.match(sql, /INSERT INTO situations/);
  assert.match(sql, /key, display_code, title/);
  assert.match(sql, /'BD-01', 'S01'/);
  assert.match(sql, /category, difficulty, difficulty_level/);
  assert.match(sql, /'Singles', 'intermediate', 'intermediate'/);
  assert.match(sql, /INSERT OR IGNORE INTO teaching_categories/);
  assert.match(sql, /INSERT INTO situation_teaching_categories/);
  assert.match(sql, /INSERT INTO situation_play_outcomes/);
  assert.match(sql, /'single', 'first', 0, NULL, NULL, 'ready'/);
  assert.match(sql, /INSERT INTO situation_runner_outcomes/);
  assert.match(sql, /'first', 'second', NULL, NULL, 0/);
  assert.match(sql, /'cutoffs-relays', 1/);
  assert.match(sql, /ON CONFLICT\(key\) DO UPDATE/);
  assert.match(sql, /display_code=COALESCE\(situations\.display_code, excluded\.display_code\)/);
  assert.match(sql, /Coach''s Choice/);
  assert.match(sql, /archived_at=NULL, archived_by=NULL/);
  assert.doesNotMatch(sql, /INSERT INTO (users|teams|team_memberships)/);
});

test('flags ambiguous legacy outcomes for administrator review', () => {
  const sql = buildSituationSeedSql([{
    key: 'S-MTMU286H-0', title: 'Squeeze Bunt', category: 'General',
    hitType: 'grounder', batterAdvance: 0,
    runnersOn: { first: true, second: false, third: false },
  }]);

  assert.match(sql, /'squeeze_bunt', 'out', 1, 'batter_first', 1, 'needs_review'/);
  assert.match(sql, /'first', 'hold', NULL, NULL, 0/);
});

test('preserves a single when the batter takes second on the selected throw', () => {
  const sql = buildSituationSeedSql([{
    key: 'BD-06', title: 'Situation #6', desc: 'Single to RF',
    hitType: 'line', batterAdvance: 2,
    runnersOn: { first: true, second: false, third: false },
    playOutcome: {
      result: 'single', batterResult: 'second', outsRecorded: 0, reviewStatus: 'ready',
    },
    runnerOutcomes: [
      { startingBase: 'first', result: 'third', taggedUp: false },
    ],
  }]);

  assert.match(sql, /'single', 'second', 0, NULL, NULL, 'ready'/);
  assert.match(sql, /'first', 'third', NULL, NULL, 0/);
});

test('rejects empty and duplicate situation collections', () => {
  assert.throws(() => buildSituationSeedSql([]), /at least one situation/i);
  assert.throws(
    () => buildSituationSeedSql([{ key: 'BD-01' }, { key: 'BD-01' }]),
    /duplicate situation key/i,
  );
});
