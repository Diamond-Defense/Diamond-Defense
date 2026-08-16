import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PROJECT_WRANGLER_LOG_PATH,
  applyWranglerLogDefaults,
  runNpm,
} from './lib/process.mjs';
import {
  DEVELOPMENT_STATE,
  PROJECT_ROOT,
  applyLocalMigrations,
  localDatabaseName,
  parsePort,
  readWranglerConfig,
  seedIfEmpty,
  serveWorker,
} from './lib/workflow.mjs';

export async function main(argumentsList = process.argv.slice(2)) {
  applyWranglerLogDefaults({ WRANGLER_LOG_PATH: PROJECT_WRANGLER_LOG_PATH });
  const port = parsePort(argumentsList, 8788);
  const config = await readWranglerConfig();
  const database = localDatabaseName(config);

  console.log(`Preparing persistent local D1 data in ${DEVELOPMENT_STATE}`);
  await applyLocalMigrations(database, DEVELOPMENT_STATE);
  await seedIfEmpty(database, DEVELOPMENT_STATE);
  await runNpm(['run', 'build'], { cwd: PROJECT_ROOT });
  await serveWorker({ port, statePath: DEVELOPMENT_STATE });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`Local startup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
