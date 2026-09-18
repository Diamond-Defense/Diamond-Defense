import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

test('reference corrections publish new revisions without changing history', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE situations (
      key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      difficulty_level TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE situation_versions (
      situation_key TEXT NOT NULL,
      revision INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (situation_key, revision),
      FOREIGN KEY (situation_key) REFERENCES situations(key) ON DELETE CASCADE
    );
    CREATE TABLE situation_teaching_categories (
      situation_key TEXT NOT NULL,
      category_id TEXT NOT NULL,
      is_primary INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (situation_key, category_id),
      FOREIGN KEY (situation_key) REFERENCES situations(key) ON DELETE CASCADE
    );
    CREATE TABLE situation_version_teaching_categories (
      situation_key TEXT NOT NULL,
      situation_revision INTEGER NOT NULL,
      category_id TEXT NOT NULL,
      is_primary INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (situation_key, situation_revision, category_id),
      FOREIGN KEY (situation_key, situation_revision)
        REFERENCES situation_versions(situation_key, revision) ON DELETE CASCADE
    );
    CREATE TABLE situation_play_outcomes (
      situation_key TEXT PRIMARY KEY,
      play_result TEXT NOT NULL,
      batter_result TEXT NOT NULL,
      outs_recorded INTEGER NOT NULL,
      batter_out_type TEXT,
      batter_out_order INTEGER,
      review_status TEXT NOT NULL,
      FOREIGN KEY (situation_key) REFERENCES situations(key) ON DELETE CASCADE
    );
    CREATE TABLE situation_runner_outcomes (
      situation_key TEXT NOT NULL,
      starting_base TEXT NOT NULL,
      runner_result TEXT NOT NULL,
      out_type TEXT,
      out_order INTEGER,
      tagged_up INTEGER NOT NULL,
      PRIMARY KEY (situation_key, starting_base),
      FOREIGN KEY (situation_key) REFERENCES situation_play_outcomes(situation_key) ON DELETE CASCADE
    );
    CREATE TABLE situation_version_play_outcomes (
      situation_key TEXT NOT NULL,
      situation_revision INTEGER NOT NULL,
      play_result TEXT NOT NULL,
      batter_result TEXT NOT NULL,
      outs_recorded INTEGER NOT NULL,
      batter_out_type TEXT,
      batter_out_order INTEGER,
      review_status TEXT NOT NULL,
      PRIMARY KEY (situation_key, situation_revision),
      FOREIGN KEY (situation_key, situation_revision)
        REFERENCES situation_versions(situation_key, revision) ON DELETE CASCADE
    );
    CREATE TABLE situation_version_runner_outcomes (
      situation_key TEXT NOT NULL,
      situation_revision INTEGER NOT NULL,
      starting_base TEXT NOT NULL,
      runner_result TEXT NOT NULL,
      out_type TEXT,
      out_order INTEGER,
      tagged_up INTEGER NOT NULL,
      PRIMARY KEY (situation_key, situation_revision, starting_base),
      FOREIGN KEY (situation_key, situation_revision)
        REFERENCES situation_version_play_outcomes(situation_key, situation_revision) ON DELETE CASCADE
    );
  `);

  const originalPayload = JSON.stringify({
    playSeq: ['RF', 'SS', '3B'],
    targets: {
      '1B': { x: 1953, y: 794, notes: 'Cover first.' },
      '2B': { x: 1607, y: 840, notes: 'Cover second.' },
      RF: { x: 2106, y: 561, notes: 'Throw to third.' },
    },
    playOutcome: {
      result: 'double', batterResult: 'second', outsRecorded: 0, reviewStatus: 'ready',
    },
    runnerOutcomes: [
      { startingBase: 'first', result: 'third', taggedUp: false },
    ],
  });
  database.prepare('INSERT INTO situations VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('BD-06', 'Situation #6', 'Singles', 'advanced', originalPayload, 2, '2026-09-01T00:00:00.000Z');
  database.prepare('INSERT INTO situation_versions VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('BD-06', 2, 'Situation #6', 'Singles', 'advanced', originalPayload, '2026-09-01T00:00:00.000Z');
  database.prepare('INSERT INTO situation_teaching_categories VALUES (?, ?, ?, ?)')
    .run('BD-06', 'cutoffs-relays', 1, 0);
  database.prepare('INSERT INTO situation_play_outcomes VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('BD-06', 'double', 'second', 0, null, null, 'ready');
  database.prepare('INSERT INTO situation_runner_outcomes VALUES (?, ?, ?, ?, ?, ?)')
    .run('BD-06', 'first', 'third', null, null, 0);

  database.exec(await readFile(
    new URL('../migrations/0021_reference_situation_corrections.sql', import.meta.url),
    'utf8',
  ));

  const current = database.prepare(
    "SELECT revision, payload_json FROM situations WHERE key = 'BD-06'",
  ).get();
  const payload = JSON.parse(current.payload_json);
  assert.equal(current.revision, 3);
  assert.deepEqual(
    { x: payload.targets['1B'].x, y: payload.targets['1B'].y },
    { x: 2166, y: 1184 },
  );
  assert.equal(payload.playOutcome.result, 'single');
  assert.equal(database.prepare(
    "SELECT play_result FROM situation_play_outcomes WHERE situation_key = 'BD-06'",
  ).get().play_result, 'single');
  assert.equal(database.prepare(
    "SELECT play_result FROM situation_version_play_outcomes WHERE situation_key = 'BD-06' AND situation_revision = 3",
  ).get().play_result, 'single');
  assert.equal(database.prepare(
    "SELECT COUNT(*) AS count FROM situation_version_runner_outcomes WHERE situation_key = 'BD-06' AND situation_revision = 3",
  ).get().count, 1);
  assert.equal(database.prepare(
    "SELECT COUNT(*) AS count FROM situation_version_teaching_categories WHERE situation_key = 'BD-06' AND situation_revision = 3",
  ).get().count, 1);
  assert.equal(JSON.parse(database.prepare(
    "SELECT payload_json FROM situation_versions WHERE situation_key = 'BD-06' AND revision = 2",
  ).get().payload_json).playOutcome.result, 'double');
});
