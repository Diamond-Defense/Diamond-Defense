import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDevelopmentInsights } from '../src/lib/server/results/development.ts';

function attempt(overrides = {}) {
  return {
    id:crypto.randomUUID(),
    playerId:'player-1',
    playerName:'Player One',
    playerNumber:'1',
    teamName:'Test Team',
    situationKey:'S01',
    situationTitle:'Single to left',
    phase:2,
    lifecycleStatus:'completed',
    outcome:'passed',
    createdAt:'2026-01-01T00:00:20.000Z',
    startedAt:'2026-01-01T00:00:00.000Z',
    completedAt:'2026-01-01T00:00:20.000Z',
    phase1:{ ok:true, scoreCorrect:9, scoreTotal:9, triesUsed:1, elapsed:10, completedAt:'2026-01-01T00:00:10.000Z' },
    sequenceStages:[{ stage:1, success:true, triesUsed:1, timeElapsed:10, picked:['LF'], expected:['LF'], completedAt:'2026-01-01T00:00:20.000Z' }],
    seasonName:'Spring 2026',
    activityType:'free_play',
    assignmentTitle:null,
    assignmentCycleNumber:null,
    assignmentDueAt:null,
    assignmentStatus:null,
    recipientStatus:null,
    difficulty:'foundational',
    primaryCategory:'Cutoffs & Relays',
    teachingCategories:['Cutoffs & Relays'],
    isRetake:false,
    isOverdue:false,
    isLateCompletion:false,
    ...overrides,
  };
}

test('development insights compare progress, phases, trends, and missed situations', () => {
  const insights = buildDevelopmentInsights([
    attempt({
      id:'early-fail', outcome:'failed', completedAt:'2026-01-10T00:00:30.000Z',
      phase1:{ ok:false, scoreCorrect:5, scoreTotal:9, triesUsed:3, elapsed:20, completedAt:'2026-01-10T00:00:20.000Z' },
      sequenceStages:[],
    }),
    attempt({ id:'early-pass', completedAt:'2026-01-20T00:00:20.000Z' }),
    attempt({ id:'recent-pass-1', createdAt:'2026-02-01T00:00:15.000Z', completedAt:'2026-02-01T00:00:15.000Z' }),
    attempt({ id:'recent-pass-2', createdAt:'2026-02-10T00:00:15.000Z', completedAt:'2026-02-10T00:00:15.000Z' }),
    attempt({ id:'open', lifecycleStatus:'incomplete', outcome:undefined }),
  ]);

  assert.equal(insights.finalizedAttempts, 4);
  assert.equal(insights.trend.length, 2);
  assert.equal(insights.phases.positioning.passRate, 75);
  assert.equal(insights.phases.sequence.passRate, 100);
  assert.equal(insights.improvement.sampleSize, 4);
  assert.equal(insights.improvement.passRateChange, 50);
  assert.equal(insights.attentionSituations[0].missed, 1);
  assert.equal(insights.attentionSituations[0].positioningMisses, 1);
  assert.equal(insights.playerProgress.length, 1);
  assert.equal(insights.playerProgress[0].passRate, 75);
});

test('development insights keep unavailable values null instead of reporting zero', () => {
  const insights = buildDevelopmentInsights([]);
  assert.equal(insights.finalizedAttempts, 0);
  assert.equal(insights.phases.positioning.passRate, null);
  assert.equal(insights.improvement.passRateChange, null);
  assert.deepEqual(insights.attentionSituations, []);
  assert.deepEqual(insights.playerProgress, []);
});
