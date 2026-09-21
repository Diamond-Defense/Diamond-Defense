import type { CoachAttempt } from '$lib/server/repositories/attempts';

export interface DevelopmentTrendPoint {
  period: string;
  interval?: 'day' | 'week' | 'month';
  attempts: number;
  passed: number;
  passRate: number | null;
  averageScorePercent: number | null;
  averageCompletionSeconds: number | null;
}

export interface DevelopmentPhaseSummary {
  attempts: number;
  passed: number;
  passRate: number | null;
}

export interface DevelopmentChangeSummary {
  sampleSize: number;
  earlierPassRate: number | null;
  recentPassRate: number | null;
  passRateChange: number | null;
  earlierScorePercent: number | null;
  recentScorePercent: number | null;
  scoreChange: number | null;
  earlierCompletionSeconds: number | null;
  recentCompletionSeconds: number | null;
  completionSecondsChange: number | null;
}

export interface DevelopmentSituationSummary {
  situationKey: string;
  situationTitle: string;
  attempts: number;
  missed: number;
  positioningMisses: number;
  sequenceMisses: number;
  passRate: number | null;
}

export interface PlayerDevelopmentSummary {
  playerId: string;
  playerName: string;
  playerNumber: string;
  attempts: number;
  passed: number;
  passRate: number | null;
  averageScorePercent: number | null;
  positioningPassRate: number | null;
  sequencePassRate: number | null;
  lastActivityAt: string | null;
}

export interface AttemptDevelopmentInsights {
  finalizedAttempts: number;
  trend: DevelopmentTrendPoint[];
  phases: {
    positioning: DevelopmentPhaseSummary;
    sequence: DevelopmentPhaseSummary;
  };
  improvement: DevelopmentChangeSummary;
  attentionSituations: DevelopmentSituationSummary[];
  playerProgress: PlayerDevelopmentSummary[];
}

interface DevelopmentAttemptIdentity {
  playerId: string;
  playerName: string;
  playerNumber: string;
  situationKey: string;
  situationTitle: string;
}

interface AttemptMetrics {
  attempt: DevelopmentAttemptIdentity;
  date: Date | null;
  passed: boolean;
  positioningPassed: boolean | null;
  sequencePassed: boolean | null;
  scorePercent: number | null;
  completionSeconds: number | null;
}

export interface DevelopmentMetricInput {
  playerId: string;
  playerName: string;
  playerNumber: string;
  situationKey: string;
  situationTitle: string;
  activityAt: string | null;
  passed: boolean;
  positioningPassed: boolean | null;
  sequencePassed: boolean | null;
  scorePercent: number | null;
  completionSeconds: number | null;
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function average(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!numbers.length) return null;
  return numbers.reduce((total, value) => total + value, 0) / numbers.length;
}

function percent(passed: number, attempts: number): number | null {
  return attempts ? (passed / attempts) * 100 : null;
}

function attemptDate(attempt: CoachAttempt): Date | null {
  const value = attempt.completedAt || attempt.startedAt || attempt.createdAt || attempt.ts;
  const date = value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.valueOf()) ? date : null;
}

function metricsFor(attempt: CoachAttempt): AttemptMetrics {
  const phaseOne = attempt.phase1 ?? null;
  const scoreCorrect = finiteNumber(phaseOne?.scoreCorrect ?? attempt.phase1ScoreCorrect ?? attempt.score);
  const scoreTotal = finiteNumber(phaseOne?.scoreTotal ?? attempt.phase1ScoreTotal ?? attempt.total);
  const positioningPassed = typeof phaseOne?.ok === 'boolean'
    ? phaseOne.ok
    : typeof attempt.phase1Ok === 'boolean'
      ? attempt.phase1Ok
    : scoreCorrect != null && scoreTotal != null && scoreTotal > 0
      ? scoreCorrect >= scoreTotal
      : null;
  const stages = Array.isArray(attempt.sequenceStages) ? attempt.sequenceStages : [];
  const sequencePassed = stages.length
    ? stages.every((stage) => stage.success === true)
    : attempt.phase === 2 && typeof attempt.sequenceSuccess === 'boolean'
      ? attempt.sequenceSuccess
      : null;
  const positioningSeconds = finiteNumber(phaseOne?.elapsed ?? attempt.phase1Elapsed);
  const sequenceSeconds = stages.reduce((total, stage) => total + (finiteNumber(stage.timeElapsed) || 0), 0);
  let completionSeconds = positioningSeconds != null || sequenceSeconds > 0
    ? (positioningSeconds || 0) + (sequenceSeconds || finiteNumber(attempt.timeElapsed) || 0)
    : finiteNumber(attempt.timeElapsed);
  if (completionSeconds == null) {
    const started = attempt.startedAt ? new Date(attempt.startedAt) : null;
    const completed = attempt.completedAt ? new Date(attempt.completedAt) : null;
    if (started && completed && !Number.isNaN(started.valueOf()) && !Number.isNaN(completed.valueOf())) {
      completionSeconds = Math.max(0, (completed.valueOf() - started.valueOf()) / 1000);
    }
  }
  return {
    attempt: {
      playerId: attempt.playerId,
      playerName: attempt.playerName,
      playerNumber: attempt.playerNumber,
      situationKey: attempt.situationKey,
      situationTitle: String(attempt.situationTitle || 'Situation'),
    },
    date: attemptDate(attempt),
    passed: attempt.outcome === 'passed' || (attempt.outcome == null && attempt.success === true),
    positioningPassed,
    sequencePassed,
    scorePercent: scoreCorrect != null && scoreTotal != null && scoreTotal > 0
      ? (scoreCorrect / scoreTotal) * 100
      : null,
    completionSeconds,
  };
}

function metricsFromInput(metric: DevelopmentMetricInput): AttemptMetrics {
  const date = metric.activityAt ? new Date(metric.activityAt) : null;
  return {
    attempt: {
      playerId: metric.playerId,
      playerName: metric.playerName,
      playerNumber: metric.playerNumber,
      situationKey: metric.situationKey,
      situationTitle: metric.situationTitle,
    },
    date: date && !Number.isNaN(date.valueOf()) ? date : null,
    passed: metric.passed,
    positioningPassed: metric.positioningPassed,
    sequencePassed: metric.sequencePassed,
    scorePercent: metric.scorePercent,
    completionSeconds: metric.completionSeconds,
  };
}

function summarizePhase(values: Array<boolean | null>): DevelopmentPhaseSummary {
  const recorded = values.filter((value): value is boolean => value != null);
  const passed = recorded.filter(Boolean).length;
  return { attempts: recorded.length, passed, passRate: percent(passed, recorded.length) };
}

function summarizeRange(metrics: AttemptMetrics[]) {
  const passed = metrics.filter((metric) => metric.passed).length;
  return {
    passRate: percent(passed, metrics.length),
    scorePercent: average(metrics.map((metric) => metric.scorePercent)),
    completionSeconds: average(metrics.map((metric) => metric.completionSeconds)),
  };
}

function difference(recent: number | null, earlier: number | null): number | null {
  return recent == null || earlier == null ? null : recent - earlier;
}

function summarizeDevelopmentMetrics(metrics: AttemptMetrics[], range: {dateFrom?:string;dateTo?:string} = {}): AttemptDevelopmentInsights {
  const finalized = metrics
    .sort((left, right) => (left.date?.valueOf() || 0) - (right.date?.valueOf() || 0));

  const dated = finalized.filter(metric=>metric.date);
  const start = range.dateFrom ? new Date(`${range.dateFrom}T00:00:00Z`) : dated[0]?.date;
  const end = range.dateTo ? new Date(`${range.dateTo}T23:59:59Z`) : dated[dated.length-1]?.date;
  const days = start && end ? (end.valueOf()-start.valueOf())/86400000 : 0;
  const interval = days <= 31 ? 'day' : days <= 92 ? 'week' : 'month';
  const byMonth = new Map<string, AttemptMetrics[]>();
  for (const metric of finalized) {
    if (!metric.date) continue;
    const bucket = new Date(metric.date);
    if(interval === 'week') bucket.setUTCDate(bucket.getUTCDate() - (bucket.getUTCDay()+6)%7);
    const period = bucket.toISOString().slice(0, interval === 'month' ? 7 : 10);
    const current = byMonth.get(period) || [];
    current.push(metric);
    byMonth.set(period, current);
  }
  const trend = [...byMonth.entries()].map(([period, metrics]) => {
    const summary = summarizeRange(metrics);
    return {
      period,
      interval: interval as 'day' | 'week' | 'month',
      attempts: metrics.length,
      passed: metrics.filter((metric) => metric.passed).length,
      passRate: summary.passRate,
      averageScorePercent: summary.scorePercent,
      averageCompletionSeconds: summary.completionSeconds,
    };
  });

  const comparableCount = finalized.length >= 4 ? Math.floor(finalized.length / 2) : 0;
  const earlierMetrics = comparableCount ? finalized.slice(0, comparableCount) : [];
  const recentMetrics = comparableCount ? finalized.slice(-comparableCount) : [];
  const earlier = summarizeRange(earlierMetrics);
  const recent = summarizeRange(recentMetrics);

  const bySituation = new Map<string, DevelopmentSituationSummary>();
  const byPlayer = new Map<string, AttemptMetrics[]>();
  for (const metric of finalized) {
    const playerMetrics = byPlayer.get(metric.attempt.playerId) || [];
    playerMetrics.push(metric);
    byPlayer.set(metric.attempt.playerId, playerMetrics);
    const key = String(metric.attempt.situationKey || '');
    if (!key) continue;
    const current = bySituation.get(key) || {
      situationKey: key,
      situationTitle: String(metric.attempt.situationTitle || 'Situation'),
      attempts: 0,
      missed: 0,
      positioningMisses: 0,
      sequenceMisses: 0,
      passRate: null,
    };
    current.attempts += 1;
    if (!metric.passed) current.missed += 1;
    if (metric.positioningPassed === false) current.positioningMisses += 1;
    if (metric.sequencePassed === false) current.sequenceMisses += 1;
    current.passRate = percent(current.attempts - current.missed, current.attempts);
    bySituation.set(key, current);
  }

  const playerProgress = [...byPlayer.values()].map((metrics) => {
    const latest = metrics[metrics.length - 1];
    const range = summarizeRange(metrics);
    return {
      playerId: latest.attempt.playerId,
      playerName: latest.attempt.playerName,
      playerNumber: latest.attempt.playerNumber,
      attempts: metrics.length,
      passed: metrics.filter((metric) => metric.passed).length,
      passRate: range.passRate,
      averageScorePercent: range.scorePercent,
      positioningPassRate: summarizePhase(metrics.map((metric) => metric.positioningPassed)).passRate,
      sequencePassRate: summarizePhase(metrics.map((metric) => metric.sequencePassed)).passRate,
      lastActivityAt: latest.date?.toISOString() || null,
    };
  }).sort((left, right) => (left.passRate ?? 101) - (right.passRate ?? 101)
    || right.attempts - left.attempts || left.playerName.localeCompare(right.playerName));

  return {
    finalizedAttempts: finalized.length,
    trend,
    phases: {
      positioning: summarizePhase(finalized.map((metric) => metric.positioningPassed)),
      sequence: summarizePhase(finalized.map((metric) => metric.sequencePassed)),
    },
    improvement: {
      sampleSize: comparableCount * 2,
      earlierPassRate: earlier.passRate,
      recentPassRate: recent.passRate,
      passRateChange: difference(recent.passRate, earlier.passRate),
      earlierScorePercent: earlier.scorePercent,
      recentScorePercent: recent.scorePercent,
      scoreChange: difference(recent.scorePercent, earlier.scorePercent),
      earlierCompletionSeconds: earlier.completionSeconds,
      recentCompletionSeconds: recent.completionSeconds,
      completionSecondsChange: difference(recent.completionSeconds, earlier.completionSeconds),
    },
    attentionSituations: [...bySituation.values()]
      .filter((situation) => situation.missed > 0)
      .sort((left, right) => right.missed - left.missed || right.attempts - left.attempts
        || left.situationTitle.localeCompare(right.situationTitle))
      .slice(0, 5),
    playerProgress: playerProgress.slice(0, 8),
  };
}

export function buildDevelopmentInsights(attempts: CoachAttempt[]): AttemptDevelopmentInsights {
  return summarizeDevelopmentMetrics(attempts
    .filter((attempt) => attempt.lifecycleStatus !== 'incomplete' && attempt.outcome !== 'abandoned')
    .map(metricsFor));
}

export function buildDevelopmentInsightsFromMetrics(
  metrics: DevelopmentMetricInput[],
  range: {dateFrom?:string;dateTo?:string} = {},
): AttemptDevelopmentInsights {
  return summarizeDevelopmentMetrics(metrics.map(metricsFromInput), range);
}
