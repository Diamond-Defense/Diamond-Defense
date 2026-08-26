import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSituationSeedSql } from './lib/situation-seed.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const situations = JSON.parse(await readFile(resolve(root, 'situations.json'), 'utf8'));
const output = resolve(root, 'database/situations-seed.sql');

await mkdir(dirname(output), { recursive: true });
await writeFile(output, buildSituationSeedSql(situations), 'utf8');
console.log(`Generated ${output} with ${situations.length} situations and no account data.`);
