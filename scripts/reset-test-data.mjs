import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { PROJECT_WRANGLER_LOG_PATH, applyWranglerLogDefaults, runWrangler } from './lib/process.mjs';
import { DEVELOPMENT_STATE, PROJECT_ROOT, applyLocalMigrations } from './lib/workflow.mjs';

const argumentsList = process.argv.slice(2);
const unknownArguments = argumentsList.filter((argument) => argument !== '--preview');
if (unknownArguments.length) {
  throw new Error(`Unsupported reset option: ${unknownArguments.join(', ')}. Only --preview is allowed.`);
}
const target = argumentsList.includes('--preview') ? 'preview' : 'local';
const database = target === 'preview' ? 'diamond-defense-preview' : 'diamond-defense';
const phrase = target === 'preview' ? 'RESET PREVIEW TEST DATA' : 'RESET LOCAL TEST DATA';
const seedFile = resolve(PROJECT_ROOT, 'database/seed.sql');
const cleanupSql = [
  'PRAGMA defer_foreign_keys=TRUE;',
  'DELETE FROM sessions;', 'DELETE FROM audit_log;', 'DELETE FROM deletion_audit;',
  'DELETE FROM situation_submissions;', 'DELETE FROM assignment_progress;', 'DELETE FROM attempts;',
  'DELETE FROM assignment_situations;', 'DELETE FROM assignment_recipients;', 'DELETE FROM practice_assignments;',
  'DELETE FROM situation_versions;', 'DELETE FROM season_memberships;', 'DELETE FROM team_memberships;',
  'DELETE FROM team_seasons;', 'DELETE FROM situations;', 'DELETE FROM users;', 'DELETE FROM teams;',
  'PRAGMA defer_foreign_keys=FALSE;',
].join(' ');

async function confirm() {
  if (!process.stdin.isTTY) throw new Error(`Interactive confirmation is required. Type ${phrase} when prompted.`);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`This permanently replaces ${target} data. Type ${phrase} to continue: `);
  prompt.close();
  if (answer !== phrase) throw new Error('Test-data reset cancelled.');
}

async function main() {
  applyWranglerLogDefaults({ WRANGLER_LOG_PATH: PROJECT_WRANGLER_LOG_PATH });
  await confirm();
  const common = target === 'preview'
    ? [database, '--remote', '--env', 'preview']
    : [database, '--local', '--persist-to', DEVELOPMENT_STATE];
  if (target === 'preview') {
    const backupDirectory = resolve(PROJECT_ROOT, '.wrangler/reset-backups');
    await mkdir(backupDirectory, { recursive: true });
    const backup = resolve(backupDirectory, `preview-before-reset-${new Date().toISOString().replaceAll(':', '-')}.sql`);
    await runWrangler(['d1', 'export', database, '--remote', '--env', 'preview', '--output', backup, '--skip-confirmation'], { cwd: PROJECT_ROOT });
  }
  await runWrangler(['d1', 'execute', ...common, '--command', cleanupSql, '--yes'], { cwd: PROJECT_ROOT });
  if (target === 'local') {
    await applyLocalMigrations(database, DEVELOPMENT_STATE);
  } else {
    await runWrangler(['d1', 'migrations', 'apply', database, '--remote', '--env', 'preview'], {
      cwd: PROJECT_ROOT,
      env: { CI: 'true' },
    });
  }
  await runWrangler(['d1', 'execute', ...common, `--file=${seedFile}`, '--yes'], { cwd: PROJECT_ROOT });
  console.log(`${target === 'preview' ? 'Preview' : 'Local'} test data reset complete. All seeded passwords are "password".`);
}

main().catch((error) => {
  console.error(`Test-data reset failed: ${error.message}`);
  process.exitCode = 1;
});
