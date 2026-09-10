import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { applyWranglerLogDefaults, PROJECT_WRANGLER_LOG_PATH, runWrangler } from './lib/process.mjs';

const TARGETS = {
  local: {
    database:'diamond-defense',
    arguments:['--local', '--persist-to', '.wrangler/state'],
  },
  preview: {
    database:'diamond-defense-preview',
    arguments:['--remote', '--env', 'preview'],
  },
  production: {
    database:'diamond-defense-production',
    arguments:['--remote', '--env', 'production'],
  },
};

export const QUERY_PLAN_CHECKS = [
  {
    name:'recent team results',
    index:'idx_attempts_team_created',
    sql:"SELECT id FROM attempts WHERE team_id = 'query-plan-team' ORDER BY created_at DESC LIMIT 5",
  },
  {
    name:'individual player history',
    index:'idx_attempts_team_player_created',
    sql:"SELECT id FROM attempts WHERE team_id = 'query-plan-team' AND player_id = 'query-plan-player' ORDER BY created_at DESC LIMIT 5",
  },
  {
    name:'assignment results',
    index:'idx_attempts_team_assignment_created',
    sql:"SELECT id FROM attempts WHERE team_id = 'query-plan-team' AND assignment_id = 'query-plan-assignment' ORDER BY created_at DESC LIMIT 5",
  },
  {
    name:'attempt lifecycle filter',
    index:'idx_attempts_team_lifecycle_created',
    sql:"SELECT id FROM attempts WHERE team_id = 'query-plan-team' AND lifecycle_status = 'incomplete' ORDER BY created_at DESC LIMIT 5",
  },
  {
    name:'report date range',
    index:'idx_attempts_team_report_date',
    sql:"SELECT id FROM attempts WHERE team_id = 'query-plan-team' AND COALESCE(completed_at, created_at) >= '2026-01-01T00:00:00.000Z' AND COALESCE(completed_at, created_at) < '2027-01-01T00:00:00.000Z' ORDER BY COALESCE(completed_at, created_at) DESC LIMIT 5",
  },
  {
    name:'pending player practice',
    index:'idx_assignment_recipients_player_pending',
    sql:"SELECT assignment_id FROM assignment_recipients WHERE player_id = 'query-plan-player' AND withdrawn_at IS NULL AND status <> 'completed' ORDER BY assigned_at DESC LIMIT 5",
  },
  {
    name:'next assigned situation',
    index:'sqlite_autoindex_assignment_progress_1',
    sql:"SELECT situation_key FROM assignment_progress WHERE assignment_id = 'query-plan-assignment' AND player_id = 'query-plan-player' AND progress_status <> 'completed' ORDER BY situation_key LIMIT 1",
  },
  {
    name:'active assignment listing',
    index:'idx_practice_assignments_team_status',
    sql:"SELECT id FROM practice_assignments WHERE team_id = 'query-plan-team' AND status = 'active' ORDER BY due_at, created_at DESC LIMIT 6",
  },
  {
    name:'season listing',
    index:'idx_team_seasons_team_status',
    sql:"SELECT id FROM team_seasons WHERE team_id = 'query-plan-team' AND status = 'active' ORDER BY starts_on DESC, created_at DESC LIMIT 5",
  },
];

function parseTarget(argumentsList) {
  const requested = argumentsList[0] || 'local';
  if (!(requested in TARGETS)) {
    throw new Error('Target must be local, preview, or production.');
  }
  return { name:requested, ...TARGETS[requested] };
}

export function parseWranglerQueryPlanOutput(output) {
  const text = String(output || '').trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end <= start) throw new Error('Wrangler did not return JSON query-plan output.');
    parsed = JSON.parse(text.slice(start, end + 1));
  }
  const executions = Array.isArray(parsed) ? parsed : [parsed];
  return executions.flatMap((execution) => Array.isArray(execution?.results) ? execution.results : []);
}

export function missingExpectedIndexes(rows, checks = QUERY_PLAN_CHECKS) {
  const details = rows.map((row) => String(row?.detail || ''));
  return checks.filter((check) => !details.some((detail) => detail.includes(check.index)));
}

export async function main(argumentsList = process.argv.slice(2)) {
  const target = parseTarget(argumentsList);
  applyWranglerLogDefaults({ WRANGLER_LOG_PATH: PROJECT_WRANGLER_LOG_PATH });
  const command = QUERY_PLAN_CHECKS
    .map((check) => `EXPLAIN QUERY PLAN ${check.sql};`)
    .join('\n');
  const { stdout } = await runWrangler([
    'd1', 'execute', target.database, ...target.arguments,
    '--command', command, '--json',
  ], { cwd:resolve(fileURLToPath(new URL('..', import.meta.url))), capture:true });
  const rows = parseWranglerQueryPlanOutput(stdout);
  const missing = missingExpectedIndexes(rows);
  if (missing.length) {
    throw new Error(`Query-plan verification failed for: ${missing.map((check) => check.name).join(', ')}. Apply migration 0020 first.`);
  }
  process.stdout.write(`Verified ${QUERY_PLAN_CHECKS.length} indexed D1 query paths on ${target.name}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
