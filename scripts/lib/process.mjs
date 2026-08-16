import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROCESS_LIBRARY_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const PROJECT_WRANGLER_LOG_PATH = resolve(
  PROCESS_LIBRARY_DIRECTORY,
  '../../.wrangler/logs',
);
const PROJECT_WRANGLER_EXECUTABLE = resolve(
  PROCESS_LIBRARY_DIRECTORY,
  '../../node_modules/.bin',
  executable('wrangler'),
);

export function defaultWranglerLogEnvironment(defaults, environment = process.env) {
  if (
    environment.WRANGLER_LOG_PATH !== undefined ||
    environment.WRANGLER_WRITE_LOGS !== undefined
  ) {
    return {};
  }
  return { ...defaults };
}

export function applyWranglerLogDefaults(defaults, environment = process.env) {
  Object.assign(environment, defaultWranglerLogEnvironment(defaults, environment));
  return environment;
}

export function executable(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

export function run(command, argumentsList = [], options = {}) {
  const capture = Boolean(options.capture);
  const childEnvironment = { ...process.env, ...options.env };

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, argumentsList, {
      cwd: options.cwd ?? process.cwd(),
      env: childEnvironment,
      shell: false,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';

    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
    }

    child.on('error', rejectPromise);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      const detail = capture ? stderr.trim() || stdout.trim() : '';
      rejectPromise(
        new Error(
          detail ||
            `${command} exited ${signal ? `after signal ${signal}` : `with code ${code}`}.`,
        ),
      );
    });
  });
}

export function runNpm(argumentsList, options = {}) {
  return run(executable('npm'), argumentsList, options);
}

export function runWrangler(argumentsList, options = {}) {
  const configuredEnvironment = { ...process.env, ...options.env };
  const logEnvironment = defaultWranglerLogEnvironment(
    { WRANGLER_LOG_PATH: PROJECT_WRANGLER_LOG_PATH },
    configuredEnvironment,
  );
  return run(PROJECT_WRANGLER_EXECUTABLE, argumentsList, {
    ...options,
    env: { ...logEnvironment, ...options.env },
  });
}
