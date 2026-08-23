import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import {
  PROJECT_WRANGLER_LOG_PATH,
  applyWranglerLogDefaults,
  runWrangler,
} from './lib/process.mjs';
import {
  DEVELOPMENT_STATE,
  PROJECT_ROOT,
  applyLocalMigrations,
  isPlaceholderDatabaseId,
  localDatabaseName,
  parseWranglerJson,
  readWranglerConfig,
  remoteDatabaseFor,
} from './lib/workflow.mjs';
import {
  IMPORT_TABLES,
  REFRESH_CONFIRMATION_ENV,
  REFRESH_PASSWORD_ENV,
  buildReplacementSql,
  buildValidationSql,
  confirmationPhrase,
  createPasswordRecord,
  parseRefreshArguments,
  validateRefreshPassword,
  validateRefreshResult,
} from './lib/database-refresh.mjs';

const BACKUP_ROOT = resolve(PROJECT_ROOT, '.wrangler/refresh-backups');
const SECRET_ENVIRONMENT_NAMES = [REFRESH_PASSWORD_ENV];

function usage() {
  return `Copy production data into an isolated Diamond Defense environment.

Usage:
  npm run db:refresh:preview [-- --anonymize-players]
  npm run db:refresh:local [-- --anonymize-players]

Options:
  --target <preview|local>  Destination (provided by the npm commands)
  --anonymize-players      Replace player display names and usernames
  --dry-run                Validate configuration and show the operation only
  --confirm <phrase>       Non-interactive typed confirmation
  --help                   Show this help

Set ${REFRESH_PASSWORD_ENV} to the shared non-production login password when
running non-interactively. It is never printed or passed on the command line.
Set ${REFRESH_CONFIRMATION_ENV}, or use --confirm, to the exact phrase shown by
the dry run. Production is always read-only.`;
}

function timestamp() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function targetLabel(target) {
  return target === 'preview' ? 'Cloudflare preview' : 'local development';
}

function targetExecuteArguments(target, database, trailingArguments) {
  if (target === 'preview') {
    return ['d1', 'execute', database, '--remote', '--env', 'preview', ...trailingArguments];
  }
  return [
    'd1', 'execute', database, '--local', '--persist-to', DEVELOPMENT_STATE,
    ...trailingArguments,
  ];
}

function targetExportArguments(target, database, output) {
  if (target === 'preview') {
    return [
      'd1', 'export', database, '--remote', '--env', 'preview',
      '--output', output, '--skip-confirmation',
    ];
  }
  return [
    'd1', 'export', database, '--local', '--output', output, '--skip-confirmation',
  ];
}

function sourceExportArguments(database, output) {
  const tableArguments = IMPORT_TABLES.flatMap((table) => ['--table', table]);
  return [
    'd1', 'export', database, '--remote', '--env', 'production', '--no-schema',
    ...tableArguments, '--output', output, '--skip-confirmation',
  ];
}

async function localDatabaseExists() {
  try {
    const entries = await readdir(DEVELOPMENT_STATE, { recursive: true });
    return entries.some((entry) => String(entry).endsWith('.sqlite'));
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function promptHidden(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `An interactive terminal is required. For automation, set ${REFRESH_PASSWORD_ENV}.`,
    );
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const input = process.stdin;
    const output = process.stdout;
    const previousRawMode = input.isRaw;
    let value = '';
    let escapeCharacters = 0;
    const restore = () => {
      input.removeListener('data', onData);
      input.setRawMode(Boolean(previousRawMode));
      input.pause();
    };
    const finish = () => { restore(); output.write('\n'); resolvePromise(value); };
    const cancel = () => { restore(); output.write('\n'); rejectPromise(new Error('Refresh cancelled.')); };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        const code = character.charCodeAt(0);
        if (code === 3) return cancel();
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u001b') { escapeCharacters = 2; continue; }
        if (escapeCharacters > 0) { escapeCharacters -= 1; continue; }
        if (code === 8 || code === 127) {
          if (value.length) { value = value.slice(0, -1); output.write('\b \b'); }
        } else if (code >= 32) {
          value += character;
          output.write('*');
        }
      }
    };
    output.write(label);
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function readPassword() {
  const environmentPassword = process.env[REFRESH_PASSWORD_ENV];
  if (environmentPassword !== undefined) {
    validateRefreshPassword(environmentPassword);
    return environmentPassword;
  }
  const password = await promptHidden('Shared non-production login password: ');
  const confirmation = await promptHidden('Confirm non-production password: ');
  if (password !== confirmation) throw new Error('The password confirmation did not match.');
  validateRefreshPassword(password);
  return password;
}

async function confirmRefresh(options) {
  const expected = confirmationPhrase(options.target);
  const supplied = options.confirmation ?? process.env[REFRESH_CONFIRMATION_ENV];
  if (supplied !== undefined) {
    if (supplied !== expected) throw new Error(`Confirmation must be exactly: ${expected}`);
    return;
  }
  if (!process.stdin.isTTY) {
    throw new Error(`Non-interactive refresh requires --confirm "${expected}".`);
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(
    `This will replace all ${targetLabel(options.target)} data. Type ${expected} to continue: `,
  );
  prompt.close();
  if (answer !== expected) throw new Error('Database refresh cancelled.');
}

function firstRow(output) {
  const parsed = parseWranglerJson(output);
  return parsed?.[0]?.results?.[0] ?? null;
}

async function queryTarget(target, database, sql) {
  const { stdout } = await runWrangler(
    targetExecuteArguments(target, database, ['--command', sql, '--json', '--yes']),
    {
      cwd: PROJECT_ROOT,
      capture: true,
      unsetEnv: SECRET_ENVIRONMENT_NAMES,
    },
  );
  const row = firstRow(stdout);
  if (!row) throw new Error('Wrangler returned no database validation result.');
  return row;
}

async function applyTargetMigrations(target, database) {
  if (target === 'local') {
    await applyLocalMigrations(database, DEVELOPMENT_STATE, {
      unsetEnv: SECRET_ENVIRONMENT_NAMES,
    });
    return;
  }
  await runWrangler(
    ['d1', 'migrations', 'apply', database, '--remote', '--env', 'preview'],
    { cwd: PROJECT_ROOT, env: { CI: 'true' }, unsetEnv: SECRET_ENVIRONMENT_NAMES },
  );
}

async function refresh(options) {
  const config = await readWranglerConfig();
  const source = remoteDatabaseFor(config, 'production');
  if (isPlaceholderDatabaseId(source.database_id)) {
    throw new Error('Production D1 still has a placeholder database ID.');
  }
  const destination = options.target === 'preview'
    ? remoteDatabaseFor(config, 'preview')
    : { database_name: localDatabaseName(config), database_id: 'local' };
  if (options.target === 'preview') {
    if (isPlaceholderDatabaseId(destination.database_id)) {
      throw new Error('Preview D1 still has a placeholder database ID.');
    }
    if (destination.database_id === source.database_id) {
      throw new Error('Preview and production reference the same D1 database. Refresh stopped.');
    }
  }

  console.log(`Source: production (${source.database_name}) — export only`);
  console.log(`Target: ${targetLabel(options.target)} (${destination.database_name})`);
  console.log(`Player anonymization: ${options.anonymizePlayers ? 'enabled' : 'disabled'}`);
  console.log(`Required confirmation: ${confirmationPhrase(options.target)}`);
  if (options.dryRun) {
    console.log('Dry run complete. No database was read or changed.');
    return;
  }

  await confirmRefresh(options);
  const password = await readPassword();
  const passwordRecord = createPasswordRecord(password);
  const workingDirectory = await mkdtemp(join(tmpdir(), 'diamond-defense-refresh-'));
  const backupDirectory = join(BACKUP_ROOT, `${timestamp()}-${options.target}`);
  const targetBackup = join(backupDirectory, `${options.target}-before-refresh.sql`);
  const sourceExport = join(workingDirectory, 'production-data.sql');
  const replacementFile = join(workingDirectory, 'replacement.sql');

  try {
    await mkdir(backupDirectory, { recursive: true });
    if (options.target !== 'local' || await localDatabaseExists()) {
      console.log(`Backing up ${targetLabel(options.target)}...`);
      await runWrangler(targetExportArguments(
        options.target, destination.database_name, targetBackup,
      ), { cwd: PROJECT_ROOT, unsetEnv: SECRET_ENVIRONMENT_NAMES });
      await chmod(targetBackup, 0o600);
      console.log(`Backup saved to ${targetBackup}`);
    } else {
      console.log('No existing local database was found; no target backup was needed.');
    }

    console.log('Exporting approved production data tables...');
    await runWrangler(sourceExportArguments(source.database_name, sourceExport), {
      cwd: PROJECT_ROOT,
      unsetEnv: SECRET_ENVIRONMENT_NAMES,
    });
    await chmod(sourceExport, 0o600);
    const exportedSql = await readFile(sourceExport, 'utf8');
    const replacement = buildReplacementSql(exportedSql, passwordRecord, options);
    await writeFile(replacementFile, replacement.sql, { mode: 0o600 });

    console.log(`Applying current migrations to ${targetLabel(options.target)}...`);
    await applyTargetMigrations(options.target, destination.database_name);
    const before = await queryTarget(
      options.target, destination.database_name,
      'SELECT COUNT(*) AS migrations FROM d1_migrations;',
    );

    console.log(`Replacing ${targetLabel(options.target)} application data...`);
    await runWrangler(
      targetExecuteArguments(options.target, destination.database_name, [
        '--file', replacementFile, '--yes',
      ]),
      { cwd: PROJECT_ROOT, unsetEnv: SECRET_ENVIRONMENT_NAMES },
    );

    console.log('Validating imported records and safety rules...');
    const validation = await queryTarget(
      options.target,
      destination.database_name,
      buildValidationSql(options.anonymizePlayers),
    );
    validateRefreshResult(
      validation,
      replacement.counts,
      Number(before.migrations),
      options.anonymizePlayers,
    );
    console.log(
      `Refresh complete: ${validation.users} users, ${validation.teams} teams, ` +
      `${validation.situations} situations, and ${validation.attempts} attempts.`,
    );
    console.log('All existing target sessions were removed. Sign in with the replacement password.');
    if (options.anonymizePlayers) {
      console.log('Player names and usernames were anonymized; stable database IDs were retained.');
    }
  } catch (error) {
    if (await fileExists(targetBackup)) {
      console.error(`Target backup available at ${targetBackup}`);
    }
    throw error;
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

async function fileExists(path) {
  try { await stat(path); return true; } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function main(argumentsList = process.argv.slice(2)) {
  applyWranglerLogDefaults({ WRANGLER_LOG_PATH: PROJECT_WRANGLER_LOG_PATH });
  const options = parseRefreshArguments(argumentsList);
  if (options.help) { console.log(usage()); return; }
  await refresh(options);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`Database refresh failed: ${error.message}`);
    process.exitCode = 1;
  });
}
