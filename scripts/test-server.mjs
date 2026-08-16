import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyWranglerLogDefaults, runNpm } from './lib/process.mjs';
import {
  PROJECT_ROOT,
  TEST_STATE,
  applyLocalMigrations,
  localDatabaseName,
  parsePort,
  readWranglerConfig,
  seedLocalDatabase,
  servePages,
} from './lib/workflow.mjs';

export async function main(argumentsList = process.argv.slice(2)) {
  applyWranglerLogDefaults({ WRANGLER_WRITE_LOGS: 'false' });
  const port = parsePort(argumentsList, 4175);
  const config = await readWranglerConfig();
  const database = localDatabaseName(config);

  await rm(TEST_STATE, { recursive: true, force: true });
  console.log(`Creating isolated test D1 data in ${TEST_STATE}`);
  await applyLocalMigrations(database, TEST_STATE);
  await seedLocalDatabase(database, TEST_STATE);
  await runNpm(['run', 'build'], { cwd: PROJECT_ROOT });
  await servePages({ port, statePath: TEST_STATE });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`Test server startup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
