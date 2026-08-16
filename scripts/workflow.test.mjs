import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDeployArguments } from './deploy-cloudflare.mjs';
import {
  PROJECT_WRANGLER_LOG_PATH,
  applyWranglerLogDefaults,
  defaultWranglerLogEnvironment,
} from './lib/process.mjs';
import {
  deploymentForBranch,
  isPlaceholderDatabaseId,
  parsePort,
  remoteDatabaseFor,
} from './lib/workflow.mjs';

test('maps only the main and preview branches to Cloudflare environments', () => {
  assert.deepEqual(deploymentForBranch('main'), {
    branch: 'main',
    environment: 'production',
  });
  assert.deepEqual(deploymentForBranch('preview'), {
    branch: 'preview',
    environment: 'preview',
  });
  assert.throws(() => deploymentForBranch('feature/test'), /cannot deploy/);
});

test('parses and validates workflow options', () => {
  assert.equal(parsePort([], 8788), 8788);
  assert.equal(parsePort(['--port', '9000'], 8788), 9000);
  assert.throws(() => parsePort(['--port', '70000'], 8788), /between 1 and 65535/);
  assert.deepEqual(parseDeployArguments(['--branch', 'preview', '--dry-run']), {
    branch: 'preview',
    dryRun: true,
  });
});

test('selects environment-specific D1 bindings and rejects placeholders', () => {
  const config = {
    env: {
      production: {
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'diamond-defense-production',
            database_id: '12345678-1234-1234-1234-123456789abc',
          },
        ],
      },
    },
  };
  assert.equal(
    remoteDatabaseFor(config, 'production').database_name,
    'diamond-defense-production',
  );
  assert.equal(
    isPlaceholderDatabaseId('00000000-0000-0000-0000-000000000001'),
    true,
  );
  assert.equal(
    isPlaceholderDatabaseId('12345678-1234-1234-1234-123456789abc'),
    false,
  );
});

test('uses project-local Wrangler logs while respecting explicit overrides', () => {
  assert.deepEqual(
    defaultWranglerLogEnvironment(
      { WRANGLER_LOG_PATH: PROJECT_WRANGLER_LOG_PATH },
      {},
    ),
    { WRANGLER_LOG_PATH: PROJECT_WRANGLER_LOG_PATH },
  );
  assert.deepEqual(
    defaultWranglerLogEnvironment(
      { WRANGLER_LOG_PATH: PROJECT_WRANGLER_LOG_PATH },
      { WRANGLER_WRITE_LOGS: 'false' },
    ),
    {},
  );

  const environment = {};
  applyWranglerLogDefaults({ WRANGLER_WRITE_LOGS: 'false' }, environment);
  assert.equal(environment.WRANGLER_WRITE_LOGS, 'false');
});
