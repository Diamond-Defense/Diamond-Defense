import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  applyWranglerLogDefaults,
  run,
  runNpm,
  runWrangler,
} from './lib/process.mjs';
import {
  PROJECT_ROOT,
  deploymentForBranch,
  isPlaceholderDatabaseId,
  readWranglerConfig,
  remoteDatabaseFor,
} from './lib/workflow.mjs';

export function parseDeployArguments(argumentsList) {
  const options = { branch: '', dryRun: false };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--branch') {
      options.branch = String(argumentsList[++index] ?? '');
    } else if (argument === '--dry-run') {
      options.dryRun = true;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

async function currentBranch() {
  if (process.env.WORKERS_CI_BRANCH) return process.env.WORKERS_CI_BRANCH;
  const { stdout } = await run('git', ['branch', '--show-current'], {
    cwd: PROJECT_ROOT,
    capture: true,
  });
  return stdout.trim();
}

export async function main(argumentsList = process.argv.slice(2)) {
  applyWranglerLogDefaults({ WRANGLER_WRITE_LOGS: 'false' });
  const options = parseDeployArguments(argumentsList);
  const deployment = deploymentForBranch(options.branch || (await currentBranch()));
  const config = await readWranglerConfig();
  const database = remoteDatabaseFor(config, deployment.environment);

  console.log(`Branch: ${deployment.branch}`);
  console.log(`Cloudflare environment: ${deployment.environment}`);
  console.log(`D1 database: ${database.database_name}`);
  console.log(`Worker: ${config.env?.[deployment.environment]?.name || config.name}`);

  if (options.dryRun) {
    console.log('Dry run complete; no tests, migrations, or deployment were run.');
    if (isPlaceholderDatabaseId(database.database_id)) {
      console.log('The selected D1 database ID is still a placeholder.');
    }
    return;
  }

  if (isPlaceholderDatabaseId(database.database_id)) {
    throw new Error(
      `Replace the env.${deployment.environment} D1 database_id placeholder in wrangler.jsonc before deploying.`,
    );
  }

  await runNpm(['run', 'verify'], { cwd: PROJECT_ROOT });
  await runWrangler(
    [
      'd1',
      'migrations',
      'apply',
      database.database_name,
      '--remote',
      '--env',
      deployment.environment,
    ],
    { cwd: PROJECT_ROOT },
  );
  await runWrangler(['deploy', '--env', deployment.environment], {
    cwd: PROJECT_ROOT,
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`Cloudflare deployment failed: ${error.message}`);
    process.exitCode = 1;
  });
}
