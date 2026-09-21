import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewFrames } from '../src/lib/review/coach-review.js';

test('review retains submitted positions and sequence order without mutating records', () => {
  const record = { initialPositions: { P: { x: 100, y: 200 } },
    phase1Checks: [{ positions: { P: { x: 300, y: 400 } }, scoreCorrect: 1, scoreTotal: 9 }],
    sequenceChecks: [{ stage: 2, picked: ['P', '1B'], expected: ['P', 'C'], success: false }] };
  const before = JSON.stringify(record);
  const frames = buildReviewFrames(record);
  assert.equal(frames.length, 4);
  assert.equal(frames[0].positions.P.x, 100);
  assert.equal(frames[1].positions.P.x, 300);
  assert.deepEqual(frames[3].picked, ['P', '1B']);
  assert.deepEqual(frames[3].expected, ['P', 'C']);
  assert.equal(frames[3].success, false);
  assert.equal(JSON.stringify(record), before);
});

test('legacy summaries never fabricate field coordinates or checkpoints', () => {
  assert.deepEqual(buildReviewFrames({ score: 5, picked: ['LF', 'SS'] }), []);
  assert.deepEqual(buildReviewFrames({ initialPositions: { P: { x: NaN, y: 20 }, UNKNOWN: { x: 1, y: 1 } } }), []);
});

test('stage-only records and final positions remain reviewable', () => {
  const frames = buildReviewFrames({ finalPositions: { C: { x: 900, y: 1800 } }, sequenceStages: [{ stage: 1, picked: ['C'], expected: ['C'], success: true }] });
  assert.equal(frames.length, 2);
  assert.equal(frames[1].positions.C.y, 1800);
  assert.equal(frames[1].success, true);
});
