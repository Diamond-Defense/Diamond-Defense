import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationsDirectory = new URL('../migrations/', import.meta.url);

test('migration filenames form one contiguous deployment sequence', async () => {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  assert.ok(files.length > 0, 'at least one migration is required');

  const numbers = files.map((file) => {
    const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(file);
    assert.ok(match, `${file} must use the NNNN_descriptive_name.sql format`);
    return Number(match[1]);
  });
  assert.equal(new Set(numbers).size, numbers.length, 'migration numbers must be unique');
  assert.deepEqual(numbers, numbers.map((_, index) => index + 1));

  for (const file of files) {
    const sql = await readFile(new URL(file, migrationsDirectory), 'utf8');
    assert.ok(sql.trim().length > 0, `${file} must not be empty`);
  }
});
