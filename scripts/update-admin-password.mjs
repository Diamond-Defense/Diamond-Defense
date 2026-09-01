import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import {
  PROJECT_WRANGLER_LOG_PATH,
  applyWranglerLogDefaults,
} from './lib/process.mjs';

const DEFAULT_DATABASE = 'diamond-defense';
const ADMIN_ID = 'staff-admin';
const PASSWORD_ENV = 'DIAMOND_DEFENSE_NEW_ADMIN_PASSWORD';
const ITERATIONS = 100000;
const MINIMUM_PASSWORD_LENGTH = 12;

function usage() {
  return `Update the Diamond Defense administrator password.

Usage:
  npm run admin:password
  npm run admin:password:preview
  npm run admin:password:production

Options:
  --local              Update the local D1 database (default)
  --remote             Update the selected remote D1 database
  --database <name>    Database name or binding (default: ${DEFAULT_DATABASE})
  --env <name>         Wrangler environment for a remote database
  --create-if-missing  Create the administrator account when it does not exist
  --yes                Skip the typed remote-database confirmation
  --help                Show this help

For non-interactive use, set ${PASSWORD_ENV}. The value is never passed to
Wrangler, written to SQL, or printed. Passwords must contain at least
${MINIMUM_PASSWORD_LENGTH} characters.`;
}

export function parseArguments(argumentsList) {
  const options = {
    database: DEFAULT_DATABASE,
    location: 'local',
    yes: false,
    environment: null,
    createIfMissing: false,
    help: false,
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--local') {
      options.location = 'local';
    } else if (argument === '--remote') {
      options.location = 'remote';
    } else if (argument === '--yes') {
      options.yes = true;
    } else if (argument === '--create-if-missing') {
      options.createIfMissing = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--database') {
      const database = argumentsList[++index];
      if (!database || database.startsWith('--')) {
        throw new Error('--database requires a database name or binding.');
      }
      options.database = database;
    } else if (argument === '--env') {
      const environment = argumentsList[++index];
      if (!environment || environment.startsWith('--')) {
        throw new Error('--env requires a Wrangler environment name.');
      }
      options.environment = environment;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

export function validatePassword(password) {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error(
      `The new administrator password must contain at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
    );
  }
  if (password.length > 1024) {
    throw new Error('The new administrator password is unexpectedly long.');
  }
}

export function createPasswordRecord(password) {
  validatePassword(password);
  const saltBytes = randomBytes(16);
  const hash = pbkdf2Sync(password, saltBytes, ITERATIONS, 32, 'sha256');
  return {
    hash: hash.toString('base64'),
    salt: saltBytes.toString('base64'),
    iterations: ITERATIONS,
  };
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildUpdateSql(
  record,
  updatedAt = new Date().toISOString(),
  createIfMissing = false,
) {
  const statements = [];
  if (createIfMissing) {
    statements.push(
      `INSERT INTO users (id, username, display_name, role, password_hash, password_salt, password_iterations, active, must_change_password, failed_login_attempts, password_changed_at, created_at, updated_at) SELECT ${sqlString(ADMIN_ID)}, 'admin', 'Diamond Defense Admin', 'admin', ${sqlString(record.hash)}, ${sqlString(record.salt)}, ${Number(record.iterations)}, 1, 0, 0, ${sqlString(updatedAt)}, ${sqlString(updatedAt)}, ${sqlString(updatedAt)} WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = ${sqlString(ADMIN_ID)});`,
    );
  }
  statements.push(
    `UPDATE users SET password_hash = ${sqlString(record.hash)}, password_salt = ${sqlString(record.salt)}, password_iterations = ${Number(record.iterations)}, must_change_password = 0, failed_login_attempts = 0, locked_until = NULL, password_changed_at = ${sqlString(updatedAt)}, updated_at = ${sqlString(updatedAt)} WHERE id = ${sqlString(ADMIN_ID)} AND role = 'admin';`,
    `DELETE FROM sessions WHERE user_id = ${sqlString(ADMIN_ID)};`,
  );
  return statements.join('\n');
}

function promptHidden(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `An interactive terminal is required. For automation, set ${PASSWORD_ENV}.`,
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

    const finish = () => {
      restore();
      output.write('\n');
      resolvePromise(value);
    };

    const cancel = () => {
      restore();
      output.write('\n');
      rejectPromise(new Error('Password update cancelled.'));
    };

    const onData = (chunk) => {
      for (const character of String(chunk)) {
        const code = character.charCodeAt(0);
        if (code === 3) {
          cancel();
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u001b') {
          escapeCharacters = 2;
          continue;
        }
        if (escapeCharacters > 0) {
          escapeCharacters -= 1;
          continue;
        }
        if (code === 8 || code === 127) {
          if (value.length) {
            value = value.slice(0, -1);
            output.write('\b \b');
          }
          continue;
        }
        if (code >= 32) {
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

async function readNewPassword() {
  const environmentPassword = process.env[PASSWORD_ENV];
  if (environmentPassword !== undefined) {
    validatePassword(environmentPassword);
    return environmentPassword;
  }

  const password = await promptHidden('New administrator password: ');
  const confirmation = await promptHidden('Confirm new password: ');
  if (password !== confirmation) {
    throw new Error('The password confirmation did not match.');
  }
  validatePassword(password);
  return password;
}

function wranglerCommand() {
  return process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler';
}

function runWrangler(database, location, sql, environment = null) {
  const argumentsList = [
    'd1',
    'execute',
    database,
    `--${location}`,
    '--command',
    sql,
    '--json',
    '--yes',
  ];
  if (environment) argumentsList.push('--env', environment);

  const childEnvironment = { ...process.env };
  delete childEnvironment[PASSWORD_ENV];

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(wranglerCommand(), argumentsList, {
      cwd: process.cwd(),
      env: childEnvironment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let errors = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      errors += chunk;
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code !== 0) {
        rejectPromise(
          new Error(errors.trim() || output.trim() || `Wrangler exited with code ${code}.`),
        );
        return;
      }
      try {
        resolvePromise(JSON.parse(output));
      } catch {
        rejectPromise(new Error('Wrangler returned an unexpected response.'));
      }
    });
  });
}

function firstResults(response) {
  return Array.isArray(response) && Array.isArray(response[0]?.results)
    ? response[0].results
    : [];
}

async function confirmRemote(database, skipConfirmation) {
  if (skipConfirmation) return;
  if (!process.stdin.isTTY) {
    throw new Error('Remote updates require an interactive confirmation or --yes.');
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(
    `This will update the REMOTE D1 database. Type ${database} to continue: `,
  );
  prompt.close();
  if (answer !== database) throw new Error('Remote password update cancelled.');
}

async function updatePassword(options) {
  if (options.location === 'remote') {
    await confirmRemote(options.database, options.yes);
  }

  const lookup = await runWrangler(
    options.database,
    options.location,
    `SELECT id, role FROM users WHERE id = ${sqlString(ADMIN_ID)} AND role = 'admin';`,
    options.environment,
  );
  const administratorExists = firstResults(lookup).length === 1;
  if (!administratorExists && !options.createIfMissing) {
    throw new Error(
      `The ${ADMIN_ID} account was not found. Apply the migrations and initialize the account first.`,
    );
  }

  const password = await readNewPassword();
  const record = createPasswordRecord(password);
  await runWrangler(
    options.database,
    options.location,
    buildUpdateSql(record, new Date().toISOString(), options.createIfMissing),
    options.environment,
  );

  const verification = await runWrangler(
    options.database,
    options.location,
    `SELECT password_hash, password_salt, password_iterations, must_change_password, failed_login_attempts, locked_until FROM users WHERE id = ${sqlString(ADMIN_ID)} AND role = 'admin';`,
    options.environment,
  );
  const stored = firstResults(verification)[0];
  if (
    stored?.password_hash !== record.hash ||
    stored?.password_salt !== record.salt ||
    Number(stored?.password_iterations) !== record.iterations ||
    Number(stored?.must_change_password) !== 0 ||
    Number(stored?.failed_login_attempts) !== 0 ||
    stored?.locked_until != null
  ) {
    throw new Error('The database did not retain the new password hash.');
  }

  console.log(
    `Administrator account ${administratorExists ? 'updated' : 'created'} in the ${options.location} ${options.database} database.`,
  );
  console.log('Existing administrator sessions were signed out.');
}

export async function main(argumentsList = process.argv.slice(2)) {
  applyWranglerLogDefaults({ WRANGLER_LOG_PATH: PROJECT_WRANGLER_LOG_PATH });
  const options = parseArguments(argumentsList);
  if (options.help) {
    console.log(usage());
    return;
  }
  await updatePassword(options);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`Password update failed: ${error.message}`);
    process.exitCode = 1;
  });
}
