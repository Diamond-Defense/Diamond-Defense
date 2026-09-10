import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

test('backfills legacy and custom display codes and numbers future situations', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE situations (
      key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const insert = database.prepare(`INSERT INTO situations
    (key, title, payload_json, created_at, updated_at)
    VALUES (?, ?, '{}', ?, ?)`);
  insert.run('BD-01', 'Situation 1', '2026-01-01', '2026-01-01');
  insert.run('BD-10-1', 'Situation 10.1', '2026-01-02', '2026-01-02');
  insert.run('BD-20', 'Situation 20', '2026-01-03', '2026-01-03');
  insert.run('S-MTMU286H-0', 'Squeeze Bunt', '2026-01-04', '2026-01-04');

  database.exec(await readFile(
    new URL('../migrations/0018_situation_display_codes.sql', import.meta.url),
    'utf8',
  ));
  insert.run('S-FUTURE-0', 'Future Situation', '2026-01-05', '2026-01-05');

  const codes = Object.fromEntries(database.prepare(
    'SELECT key, display_code FROM situations',
  ).all().map((row) => [row.key, row.display_code]));
  assert.deepEqual(codes, {
    'BD-01': 'S01',
    'BD-10-1': 'S10.1',
    'BD-20': 'S20',
    'S-MTMU286H-0': 'S21',
    'S-FUTURE-0': 'S22',
  });
});
