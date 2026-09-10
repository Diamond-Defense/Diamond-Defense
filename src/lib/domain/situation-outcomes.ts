import type {
  BatterResult,
  OutType,
  PlayResult,
  RunnerDestination,
  Situation,
  SituationPlayOutcome,
  SituationRunnerOutcome,
  StartingBase,
} from './models';

const STARTING_BASES: StartingBase[] = ['first', 'second', 'third'];
const PLAY_RESULTS: PlayResult[] = [
  'single', 'double', 'triple', 'home_run', 'ground_rule_double',
  'groundout', 'caught_fly', 'caught_line', 'sacrifice_bunt',
  'squeeze_bunt', 'sacrifice_fly', 'fielders_choice', 'double_play',
  'error', 'other',
];
const BATTER_RESULTS: BatterResult[] = ['out', 'first', 'second', 'third', 'home'];
const RUNNER_DESTINATIONS: RunnerDestination[] = ['hold', 'second', 'third', 'home', 'out'];
const OUT_TYPES: OutType[] = ['force', 'tag', 'catch', 'batter_first', 'other'];

export interface NormalizedSituationOutcomes {
  playOutcome: SituationPlayOutcome;
  runnerOutcomes: SituationRunnerOutcome[];
  batterAdvance: number;
}

function integer(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function destinationAfter(base: StartingBase, advance: number): RunnerDestination {
  const index = STARTING_BASES.indexOf(base) + advance;
  if (advance <= 0) return 'hold';
  if (index === 1) return 'second';
  if (index === 2) return 'third';
  return 'home';
}

function resultFromLegacy(situation: Situation, advance: number): PlayResult {
  const title = String(situation.title || '').toLowerCase();
  const category = String(situation.category || '').toLowerCase();
  if (title.includes('squeeze')) return 'squeeze_bunt';
  if (title.includes('bunt')) return 'sacrifice_bunt';
  if (category.includes('ground-rule')) return 'ground_rule_double';
  if (advance === 1) return 'single';
  if (advance === 2) return 'double';
  if (advance === 3) return 'triple';
  if (advance >= 4) return 'home_run';
  if (situation.hitType === 'grounder') return 'groundout';
  if (situation.hitType === 'popup') return 'caught_fly';
  if (situation.hitType === 'line') return 'caught_line';
  return 'other';
}

function batterResultFromAdvance(advance: number): BatterResult {
  if (advance === 1) return 'first';
  if (advance === 2) return 'second';
  if (advance === 3) return 'third';
  if (advance >= 4) return 'home';
  return 'out';
}

function advanceFromBatterResult(result: BatterResult): number {
  return { out: 0, first: 1, second: 2, third: 3, home: 4 }[result];
}

function defaultOutType(result: PlayResult, batterResult: BatterResult): OutType | undefined {
  if (batterResult !== 'out') return undefined;
  if (result === 'caught_fly' || result === 'caught_line' || result === 'sacrifice_fly') return 'catch';
  if (result === 'groundout' || result === 'sacrifice_bunt' || result === 'squeeze_bunt') return 'batter_first';
  return 'other';
}

function inferLegacy(situation: Situation): NormalizedSituationOutcomes {
  const advance = integer(situation.batterAdvance, 0, 4, 0);
  const result = resultFromLegacy(situation, advance);
  const batterResult = batterResultFromAdvance(advance);
  const ambiguous = advance === 0 || result === 'other';
  const playOutcome: SituationPlayOutcome = {
    result,
    batterResult,
    outsRecorded: batterResult === 'out' ? 1 : 0,
    ...(defaultOutType(result, batterResult) ? { batterOutType: defaultOutType(result, batterResult) } : {}),
    ...(batterResult === 'out' ? { batterOutOrder: 1 as const } : {}),
    reviewStatus: ambiguous ? 'needs_review' : 'ready',
  };
  const runnerOutcomes = STARTING_BASES
    .filter((base) => Boolean(situation.runnersOn?.[base]))
    .map((startingBase) => ({
      startingBase,
      result: destinationAfter(startingBase, advance),
      taggedUp: false,
    }));
  return { playOutcome, runnerOutcomes, batterAdvance: advance };
}

function normalizedOutType(value: unknown): OutType | undefined {
  return OUT_TYPES.includes(value as OutType) ? value as OutType : undefined;
}

export function validateSituationOutcomes(
  situation: Pick<Situation, 'outs' | 'runnersOn'>,
  playOutcome: SituationPlayOutcome,
  runnerOutcomes: SituationRunnerOutcome[],
): string[] {
  const issues: string[] = [];
  const expectedBases = STARTING_BASES.filter((base) => Boolean(situation.runnersOn?.[base]));
  const receivedBases = runnerOutcomes.map((runner) => runner.startingBase);
  if (new Set(receivedBases).size !== receivedBases.length) issues.push('Each starting runner can have only one outcome.');
  for (const base of expectedBases) {
    if (!receivedBases.includes(base)) issues.push(`Choose an outcome for the runner starting on ${base}.`);
  }
  for (const base of receivedBases) {
    if (!expectedBases.includes(base)) issues.push(`There is no starting runner on ${base}.`);
  }

  if (['sacrifice_bunt', 'squeeze_bunt', 'sacrifice_fly'].includes(playOutcome.result) && situation.outs >= 2) {
    issues.push('A sacrifice result cannot be recorded with two outs.');
  }
  if (playOutcome.result === 'squeeze_bunt' && !situation.runnersOn.third) {
    issues.push('A squeeze bunt requires a runner starting on third base.');
  }
  if (playOutcome.result === 'double_play' && situation.outs >= 2) {
    issues.push('A double play cannot be selected with two outs.');
  }
  const expectedBatterResult: Partial<Record<SituationPlayOutcome['result'], SituationPlayOutcome['batterResult']>> = {
    single: 'first', double: 'second', ground_rule_double: 'second', triple: 'third', home_run: 'home',
    groundout: 'out', caught_fly: 'out', caught_line: 'out', sacrifice_bunt: 'out',
    squeeze_bunt: 'out', sacrifice_fly: 'out', double_play: 'out',
  };
  if (expectedBatterResult[playOutcome.result]
    && playOutcome.batterResult !== expectedBatterResult[playOutcome.result]) {
    issues.push('The batter result does not match the selected play result.');
  }
  if (['single', 'double', 'triple', 'home_run', 'ground_rule_double'].includes(playOutcome.result)
    && playOutcome.outsRecorded !== 0) {
    issues.push('A safe-hit result cannot record an out.');
  }
  if (playOutcome.result === 'double_play' && playOutcome.outsRecorded !== 2) {
    issues.push('A double play must record exactly two outs.');
  }
  if (playOutcome.result === 'fielders_choice'
    && (playOutcome.batterResult !== 'first' || !runnerOutcomes.some((runner) => runner.result === 'out'))) {
    issues.push("A fielder's choice requires the batter to reach first and a runner to be retired.");
  }
  if (playOutcome.outsRecorded > 3 - situation.outs) {
    issues.push('The play records more outs than remain in the inning.');
  }

  const recordedOutcomes = (playOutcome.batterResult === 'out' ? 1 : 0)
    + runnerOutcomes.filter((runner) => runner.result === 'out').length;
  if (recordedOutcomes !== playOutcome.outsRecorded) {
    issues.push('Outs recorded must match the batter and runner outcomes.');
  }

  const occupied: string[] = runnerOutcomes
    .filter((runner) => !['out', 'home'].includes(runner.result))
    .map((runner) => runner.result === 'hold' ? runner.startingBase : runner.result);
  if (playOutcome.batterResult !== 'out' && playOutcome.batterResult !== 'home') occupied.push(playOutcome.batterResult);
  if (new Set(occupied).size !== occupied.length) issues.push('Two players cannot finish the play on the same base.');

  if (playOutcome.batterResult === 'first') {
    const first = runnerOutcomes.find((runner) => runner.startingBase === 'first');
    if (first?.result === 'hold') issues.push('The runner on first is forced to advance when the batter reaches first safely.');
    const second = runnerOutcomes.find((runner) => runner.startingBase === 'second');
    if (first && first.result !== 'out' && second?.result === 'hold') {
      issues.push('The runner on second is forced to advance while the force chain remains active.');
    }
    const third = runnerOutcomes.find((runner) => runner.startingBase === 'third');
    if (first && first.result !== 'out' && second && second.result !== 'out' && third?.result === 'hold') {
      issues.push('The runner on third is forced to advance while the force chain remains active.');
    }
  }

  if (['caught_fly', 'caught_line', 'sacrifice_fly'].includes(playOutcome.result)) {
    for (const runner of runnerOutcomes) {
      if (!['hold', 'out'].includes(runner.result) && !runner.taggedUp) {
        issues.push(`The runner starting on ${runner.startingBase} must tag up before advancing.`);
      }
    }
  }

  const inningEndingOut = 3 - situation.outs;
  const forceThirdOut = runnerOutcomes.some((runner) => runner.result === 'out'
    && runner.outType === 'force' && runner.outOrder === inningEndingOut)
    || (playOutcome.batterResult === 'out'
      && playOutcome.batterOutType === 'batter_first'
      && playOutcome.batterOutOrder === inningEndingOut);
  if (forceThirdOut && runnerOutcomes.some((runner) => runner.result === 'home')) {
    issues.push('A run cannot score when the third out is a force play or the batter is retired before reaching first.');
  }
  return Array.from(new Set(issues));
}

export function normalizeSituationOutcomes(situation: Situation): NormalizedSituationOutcomes {
  if (!situation.playOutcome || !Array.isArray(situation.runnerOutcomes)) return inferLegacy(situation);

  // The current editor still changes these legacy fields. Prefer those edits
  // when they disagree until the structured outcome editor replaces them.
  const structuredAdvance = BATTER_RESULTS.includes(situation.playOutcome.batterResult)
    ? advanceFromBatterResult(situation.playOutcome.batterResult)
    : -1;
  const legacyAdvance = integer(situation.batterAdvance, 0, 4, 0);
  const expectedBases = STARTING_BASES.filter((base) => Boolean(situation.runnersOn?.[base]));
  const suppliedBases = situation.runnerOutcomes.map((runner) => runner.startingBase);
  if (structuredAdvance !== legacyAdvance
    || expectedBases.length !== suppliedBases.length
    || expectedBases.some((base) => !suppliedBases.includes(base))) {
    return inferLegacy(situation);
  }

  const rawPlay = situation.playOutcome;
  if (!PLAY_RESULTS.includes(rawPlay.result) || !BATTER_RESULTS.includes(rawPlay.batterResult)) {
    throw new Error('Choose a valid play result and batter result.');
  }
  const outsRecorded = integer(rawPlay.outsRecorded, 0, 3, -1);
  if (outsRecorded < 0) throw new Error('Outs recorded must be between 0 and 3.');
  const playOutcome: SituationPlayOutcome = {
    result: rawPlay.result,
    batterResult: rawPlay.batterResult,
    outsRecorded: outsRecorded as 0 | 1 | 2 | 3,
    ...(normalizedOutType(rawPlay.batterOutType) ? { batterOutType: normalizedOutType(rawPlay.batterOutType) } : {}),
    ...(integer(rawPlay.batterOutOrder, 1, 3, 0) ? { batterOutOrder: integer(rawPlay.batterOutOrder, 1, 3, 0) as 1 | 2 | 3 } : {}),
    reviewStatus: rawPlay.reviewStatus === 'needs_review' ? 'needs_review' : 'ready',
  };
  const runnerOutcomes = situation.runnerOutcomes.map((runner) => {
    if (!STARTING_BASES.includes(runner.startingBase) || !RUNNER_DESTINATIONS.includes(runner.result)) {
      throw new Error('Choose a valid starting base and runner result.');
    }
    return {
      startingBase: runner.startingBase,
      result: runner.result,
      ...(normalizedOutType(runner.outType) ? { outType: normalizedOutType(runner.outType) } : {}),
      ...(integer(runner.outOrder, 1, 3, 0) ? { outOrder: integer(runner.outOrder, 1, 3, 0) as 1 | 2 | 3 } : {}),
      taggedUp: Boolean(runner.taggedUp),
    };
  });
  const issues = validateSituationOutcomes(situation, playOutcome, runnerOutcomes);
  if (issues.length && playOutcome.reviewStatus === 'ready') throw new Error(issues.join(' '));
  return {
    playOutcome,
    runnerOutcomes,
    batterAdvance: advanceFromBatterResult(playOutcome.batterResult),
  };
}
