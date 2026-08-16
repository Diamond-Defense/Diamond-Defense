import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PROJECT_WRANGLER_LOG_PATH,
  applyWranglerLogDefaults,
  runWrangler,
} from './lib/process.mjs';

export async function main(argumentsList = process.argv.slice(2)) {
  if (argumentsList.length === 0) {
    throw new Error('A Wrangler command is required.');
  }
  applyWranglerLogDefaults({ WRANGLER_LOG_PATH: PROJECT_WRANGLER_LOG_PATH });
  await runWrangler(argumentsList, { cwd: process.cwd() });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`Wrangler command failed: ${error.message}`);
    process.exitCode = 1;
  });
}
