import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyWranglerLogDefaults, runNpm } from './lib/process.mjs';
import { PROJECT_ROOT } from './lib/workflow.mjs';

export async function main() {
  applyWranglerLogDefaults({ WRANGLER_WRITE_LOGS: 'false' });
  await runNpm(['run', 'check'], { cwd: PROJECT_ROOT });
  await runNpm(['test'], { cwd: PROJECT_ROOT });
  await runNpm(['run', 'build'], { cwd: PROJECT_ROOT });
  console.log('Diamond Defense verification completed successfully.');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`Verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
