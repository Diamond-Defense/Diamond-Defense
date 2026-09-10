import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

test('backfills structured outcomes while preserving historical revision behavior', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE situations (
      key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL
    );
    CREATE TABLE situation_versions (
      situation_key TEXT NOT NULL,
      revision INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL,
      PRIMARY KEY (situation_key, revision),
      FOREIGN KEY (situation_key) REFERENCES situations(key) ON DELETE CASCADE
    );
  `);
  const currentPayload = JSON.stringify({
    hitType: 'line', batterAdvance: 1,
    runnersOn: { first: true, second: false, third: false },
  });
  const historicalPayload = JSON.stringify({
    hitType: 'line', batterAdvance: 2,
    runnersOn: { first: true, second: false, third: false },
  });
  database.prepare('INSERT INTO situations VALUES (?, ?, ?, ?)')
    .run('TEST-01', 'Single to center', 'Singles', currentPayload);
  database.prepare('INSERT INTO situation_versions VALUES (?, ?, ?, ?, ?)')
    .run('TEST-01', 1, 'Double to center', 'Extra-base hits', historicalPayload);
  const ambiguousPayload = JSON.stringify({
    hitType: 'grounder', batterAdvance: 0,
    runnersOn: { first: true, second: false, third: false },
  });
  database.prepare('INSERT INTO situations VALUES (?, ?, ?, ?)')
    .run('S-MTMU286H-0', 'Squeeze Bunt', 'General', ambiguousPayload);
  database.prepare('INSERT INTO situation_versions VALUES (?, ?, ?, ?, ?)')
    .run('S-MTMU286H-0', 1, 'Squeeze Bunt', 'General', ambiguousPayload);

  database.exec(await readFile(
    new URL('../migrations/0019_structured_situation_outcomes.sql', import.meta.url),
    'utf8',
  ));

  assert.deepEqual(
    { ...database.prepare("SELECT play_result, batter_result, review_status FROM situation_play_outcomes WHERE situation_key = 'TEST-01'").get() },
    { play_result: 'single', batter_result: 'first', review_status: 'ready' },
  );
  assert.deepEqual(
    { ...database.prepare("SELECT runner_result FROM situation_runner_outcomes WHERE situation_key = 'TEST-01'").get() },
    { runner_result: 'second' },
  );
  assert.deepEqual(
    { ...database.prepare("SELECT play_result, batter_result FROM situation_version_play_outcomes WHERE situation_key = 'TEST-01'").get() },
    { play_result: 'double', batter_result: 'second' },
  );
  assert.deepEqual(
    { ...database.prepare("SELECT runner_result FROM situation_version_runner_outcomes WHERE situation_key = 'TEST-01'").get() },
    { runner_result: 'third' },
  );
  assert.deepEqual(
    { ...database.prepare("SELECT play_result, batter_result, review_status FROM situation_play_outcomes WHERE situation_key = 'S-MTMU286H-0'").get() },
    { play_result: 'squeeze_bunt', batter_result: 'out', review_status: 'needs_review' },
  );
  assert.deepEqual(
    { ...database.prepare("SELECT runner_result FROM situation_runner_outcomes WHERE situation_key = 'S-MTMU286H-0'").get() },
    { runner_result: 'hold' },
  );
  assert.deepEqual(
    { ...database.prepare("SELECT review_status FROM situation_version_play_outcomes WHERE situation_key = 'S-MTMU286H-0'").get() },
    { review_status: 'needs_review' },
  );
});
