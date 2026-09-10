import { expect, test } from '@playwright/test';
import type { Situation } from '../src/lib/domain/models';
import {
  normalizeSituationOutcomes,
  validateSituationOutcomes,
} from '../src/lib/domain/situation-outcomes';

function situation(overrides: Partial<Situation> = {}): Situation {
  return {
    key: 'TEST-01',
    title: 'Single to center',
    desc: '',
    category: 'Singles',
    difficulty: 'foundational',
    primaryCategory: 'base-coverage',
    relatedCategories: [],
    outs: 0,
    runnersOn: { first: true, second: false, third: false },
    starts: {} as Situation['starts'],
    targets: {} as Situation['targets'],
    hit: { x: 1, y: 1 },
    hitType: 'line',
    batterAdvance: 1,
    playSeq: ['CF'],
    ...overrides,
  };
}

test.describe('structured situation outcome rules', () => {
  test('converts a legacy safe hit without changing its behavior', () => {
    expect(normalizeSituationOutcomes(situation())).toMatchObject({
      batterAdvance: 1,
      playOutcome: {
        result: 'single',
        batterResult: 'first',
        outsRecorded: 0,
        reviewStatus: 'ready',
      },
      runnerOutcomes: [{ startingBase: 'first', result: 'second', taggedUp: false }],
    });
  });

  test('flags ambiguous legacy outs for review instead of inventing runner movement', () => {
    const converted = normalizeSituationOutcomes(situation({
      title: 'Squeeze bunt',
      category: 'General',
      hitType: 'grounder',
      batterAdvance: 0,
    }));
    expect(converted.playOutcome).toMatchObject({
      result: 'squeeze_bunt',
      batterResult: 'out',
      reviewStatus: 'needs_review',
    });
    expect(converted.runnerOutcomes[0]).toMatchObject({ result: 'hold' });
  });

  test('rejects impossible force, sacrifice, and tag-up combinations', () => {
    const forceIssues = validateSituationOutcomes(
      { outs: 0, runnersOn: { first: true, second: false, third: false } },
      { result: 'single', batterResult: 'first', outsRecorded: 0, reviewStatus: 'ready' },
      [{ startingBase: 'first', result: 'hold', taggedUp: false }],
    );
    expect(forceIssues.join(' ')).toContain('forced to advance');

    const sacrificeIssues = validateSituationOutcomes(
      { outs: 2, runnersOn: { first: false, second: false, third: true } },
      { result: 'sacrifice_fly', batterResult: 'out', outsRecorded: 1, batterOutType: 'catch', batterOutOrder: 1, reviewStatus: 'ready' },
      [{ startingBase: 'third', result: 'home', taggedUp: false }],
    );
    expect(sacrificeIssues.join(' ')).toContain('cannot be recorded with two outs');
    expect(sacrificeIssues.join(' ')).toContain('must tag up');
  });

  test('requires result-specific batter and out behavior', () => {
    const safeHitIssues = validateSituationOutcomes(
      { outs: 0, runnersOn: { first: false, second: false, third: false } },
      { result: 'single', batterResult: 'second', outsRecorded: 1, reviewStatus: 'ready' },
      [],
    );
    expect(safeHitIssues.join(' ')).toContain('batter result does not match');
    expect(safeHitIssues.join(' ')).toContain('safe-hit result cannot record an out');

    const doublePlayIssues = validateSituationOutcomes(
      { outs: 0, runnersOn: { first: true, second: false, third: false } },
      { result: 'double_play', batterResult: 'out', outsRecorded: 1, batterOutType: 'batter_first', batterOutOrder: 1, reviewStatus: 'ready' },
      [{ startingBase: 'first', result: 'out', outType: 'force', outOrder: 1, taggedUp: false }],
    );
    expect(doublePlayIssues.join(' ')).toContain('exactly two outs');

    const fieldersChoiceIssues = validateSituationOutcomes(
      { outs: 0, runnersOn: { first: true, second: false, third: false } },
      { result: 'fielders_choice', batterResult: 'first', outsRecorded: 0, reviewStatus: 'ready' },
      [{ startingBase: 'first', result: 'second', taggedUp: false }],
    );
    expect(fieldersChoiceIssues.join(' ')).toContain("fielder's choice requires");
  });

  test('does not allow a run on an inning-ending force out', () => {
    const issues = validateSituationOutcomes(
      { outs: 2, runnersOn: { first: true, second: false, third: true } },
      { result: 'fielders_choice', batterResult: 'first', outsRecorded: 1, reviewStatus: 'ready' },
      [
        { startingBase: 'first', result: 'out', outType: 'force', outOrder: 1, taggedUp: false },
        { startingBase: 'third', result: 'home', taggedUp: false },
      ],
    );
    expect(issues.join(' ')).toContain('run cannot score');
  });
});
