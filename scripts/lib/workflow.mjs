import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWrangler } from './process.mjs';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DEVELOPMENT_STATE = resolve(PROJECT_ROOT, '.wrangler/state');
export const TEST_STATE = resolve(PROJECT_ROOT, '.wrangler/test-state');

export async function readWranglerConfig() {
  return JSON.parse(
    await readFile(resolve(PROJECT_ROOT, 'wrangler.jsonc'), 'utf8'),
  );
}

export function localDatabaseName(config) {
  const database = config.d1_databases?.find(({ binding }) => binding === 'DB');
  if (!database?.database_name) {
    throw new Error('wrangler.jsonc must define the local DB binding.');
  }
  return database.database_name;
}

export function parseWranglerJson(output) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error('Wrangler returned an unexpected non-JSON response.');
  }
}

export async function applyLocalMigrations(database, statePath) {
  await runWrangler(
    [
      'd1',
      'migrations',
      'apply',
      database,
      '--local',
      '--persist-to',
      statePath,
    ],
    { cwd: PROJECT_ROOT, env: { CI: 'true' } },
  );
}

export async function seedLocalDatabase(database, statePath) {
  await runWrangler(
    [
      'd1',
      'execute',
      database,
      '--local',
      '--persist-to',
      statePath,
      '--file',
      resolve(PROJECT_ROOT, 'database/seed.sql'),
      '--yes',
    ],
    { cwd: PROJECT_ROOT },
  );
}

export async function localDataCounts(database, statePath) {
  const query = `SELECT
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM teams) AS teams,
    (SELECT COUNT(*) FROM situations) AS situations;`;
  const { stdout } = await runWrangler(
    [
      'd1',
      'execute',
      database,
      '--local',
      '--persist-to',
      statePath,
      '--command',
      query,
      '--json',
    ],
    { cwd: PROJECT_ROOT, capture: true },
  );
  const response = parseWranglerJson(stdout);
  const row = response?.[0]?.results?.[0];
  if (!row) throw new Error('Unable to inspect the local D1 database.');
  return {
    users: Number(row.users ?? 0),
    teams: Number(row.teams ?? 0),
    situations: Number(row.situations ?? 0),
  };
}

export async function seedIfEmpty(database, statePath) {
  const counts = await localDataCounts(database, statePath);
  const total = counts.users + counts.teams + counts.situations;
  if (total === 0) {
    console.log('Local database is empty; installing initial seed data.');
    await seedLocalDatabase(database, statePath);
    return { seeded: true, counts };
  }
  console.log(
    `Keeping existing local data (${counts.users} users, ${counts.teams} teams, ${counts.situations} situations).`,
  );
  return { seeded: false, counts };
}

export async function serveWorker({ port, statePath }) {
  console.log(`Diamond Defense is available at http://localhost:${port}`);
  console.log('Press Ctrl+C to stop the local server.');
  await runWrangler(
    [
      'dev',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--persist-to',
      statePath,
    ],
    { cwd: PROJECT_ROOT },
  );
}

export function parsePort(argumentsList, defaultPort) {
  let port = defaultPort;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--port') {
      port = Number(argumentsList[++index]);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('The port must be an integer between 1 and 65535.');
  }
  return port;
}

export function deploymentForBranch(branch) {
  if (branch === 'main') {
    return { branch, environment: 'production' };
  }
  if (branch === 'preview') {
    return { branch, environment: 'preview' };
  }
  throw new Error(
    `Branch ${branch || '(detached)'} cannot deploy. Use main or preview.`,
  );
}

export function remoteDatabaseFor(config, environment) {
  const databases = config.env?.[environment]?.d1_databases;
  const database = databases?.find(({ binding }) => binding === 'DB');
  if (!database?.database_name || !database?.database_id) {
    throw new Error(
      `wrangler.jsonc must define the DB binding for env.${environment}.`,
    );
  }
  return database;
}

export function isPlaceholderDatabaseId(databaseId) {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    databaseId,
  ) || /^0{8}-0{4}-0{4}-0{4}-0{11}[12]$/.test(databaseId);
}
