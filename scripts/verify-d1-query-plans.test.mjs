import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  missingExpectedIndexes,
  parseWranglerQueryPlanOutput,
} from './verify-d1-query-plans.mjs';

test('query-plan verification accepts Wrangler JSON and identifies missing indexes', () => {
  const rows = parseWranglerQueryPlanOutput(JSON.stringify([
    { results:[
      { detail:'SEARCH attempts USING INDEX idx_attempts_team_assignment_created (team_id=? AND assignment_id=?)' },
      { detail:'SEARCH assignment_recipients USING INDEX idx_assignment_recipients_player_pending (player_id=?)' },
    ] },
  ]));
  const checks = [
    { name:'assignment', index:'idx_attempts_team_assignment_created' },
    { name:'queue', index:'idx_assignment_recipients_player_pending' },
    { name:'date', index:'idx_attempts_team_report_date' },
  ];
  assert.deepEqual(missingExpectedIndexes(rows, checks).map((check) => check.name), ['date']);
});

test('reporting migration defines every new index required by the query-plan checks', async () => {
  const migration = await readFile(new URL('../migrations/0020_reporting_and_queue_indexes.sql', import.meta.url), 'utf8');
  for (const index of [
    'idx_attempts_team_assignment_created',
    'idx_attempts_team_lifecycle_created',
    'idx_attempts_team_report_date',
    'idx_assignment_recipients_player_pending',
  ]) {
    assert.match(migration, new RegExp(`CREATE INDEX IF NOT EXISTS ${index}`));
  }
  assert.match(migration, /WHERE lifecycle_status = 'incomplete'/);
  assert.match(migration, /WHERE withdrawn_at IS NULL AND status <> 'completed'/);
});
