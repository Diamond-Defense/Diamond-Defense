import { error } from '@sveltejs/kit';
import type {
  AttemptOutcome,
  AttemptReportFilters,
  CoachAttempt,
  PhaseOneResult,
  SequenceStageResult,
} from '$lib/server/repositories/attempts';

const REPORT_OUTCOMES = new Set<AttemptOutcome | 'incomplete'>(['passed', 'failed', 'abandoned', 'incomplete']);
const REPORT_ACTIVITY_TYPES = new Set(['assigned', 'free_play']);
const REPORT_DIFFICULTIES = new Set(['foundational', 'intermediate', 'advanced']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function parseAttemptReportFilters(searchParams: URLSearchParams): AttemptReportFilters {
  const playerId = String(searchParams.get('playerId') || '').trim();
  const seasonId = String(searchParams.get('seasonId') || '').trim();
  const assignmentId = String(searchParams.get('assignmentId') || '').trim();
  const situationKey = String(searchParams.get('situationKey') || '').trim();
  const outcome = String(searchParams.get('outcome') || '').trim() as AttemptOutcome | 'incomplete' | '';
  const activityType = String(searchParams.get('activityType') || '').trim() as 'assigned' | 'free_play' | '';
  const difficulty = String(searchParams.get('difficulty') || '').trim() as 'foundational' | 'intermediate' | 'advanced' | '';
  const categoryId = String(searchParams.get('categoryId') || '').trim();
  const dateFrom = String(searchParams.get('dateFrom') || '').trim();
  const dateTo = String(searchParams.get('dateTo') || '').trim();
  if (
    playerId.length > 100 || seasonId.length > 100 || assignmentId.length > 100
    || situationKey.length > 100 || categoryId.length > 100
  ) {
    throw error(400, 'A report filter is too long.');
  }
  if (outcome && !REPORT_OUTCOMES.has(outcome)) {
    throw error(400, 'The result filter is invalid.');
  }
  if (activityType && !REPORT_ACTIVITY_TYPES.has(activityType)) {
    throw error(400, 'The activity filter is invalid.');
  }
  if (difficulty && !REPORT_DIFFICULTIES.has(difficulty)) {
    throw error(400, 'The difficulty filter is invalid.');
  }
  if ((dateFrom && !validDate(dateFrom)) || (dateTo && !validDate(dateTo))) {
    throw error(400, 'Report dates must use YYYY-MM-DD.');
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw error(400, 'The start date must not be after the end date.');
  }
  return {
    ...(playerId ? { playerId } : {}),
    ...(seasonId ? { seasonId } : {}),
    ...(assignmentId ? { assignmentId } : {}),
    ...(situationKey ? { situationKey } : {}),
    ...(outcome ? { outcome } : {}),
    ...(activityType ? { activityType } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };
}

function phaseOne(attempt: CoachAttempt): PhaseOneResult | null {
  if (attempt.phase1) return attempt.phase1;
  const score = attempt.phase1ScoreCorrect ?? attempt.score;
  const total = attempt.phase1ScoreTotal ?? attempt.total;
  if (score == null || total == null) return null;
  return {
    ok: Boolean(attempt.phase1Ok ?? Number(score) >= Number(total)),
    scoreCorrect: Number(score),
    scoreTotal: Number(total),
    triesUsed: Number(attempt.phase1TriesUsed ?? attempt.triesUsed ?? 0),
    elapsed: Number(attempt.phase1Elapsed ?? attempt.timeElapsed ?? 0),
    completedAt: String(attempt.completedAt || attempt.ts || ''),
  };
}

function lastSequenceStage(attempt: CoachAttempt): SequenceStageResult | null {
  const stages = Array.isArray(attempt.sequenceStages) ? attempt.sequenceStages : [];
  if (stages.length) return stages[stages.length - 1];
  if (attempt.phase !== 2) return null;
  return {
    stage: Number(attempt.stage || 1),
    success: Boolean(attempt.sequenceSuccess ?? attempt.success),
    triesUsed: Number(attempt.triesUsed || 0),
    timeElapsed: Number(attempt.timeElapsed || 0),
    picked: Array.isArray(attempt.picked) ? attempt.picked as string[] : [],
    expected: [],
    completedAt: String(attempt.completedAt || attempt.ts || ''),
  };
}

function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function attemptsCsv(attempts: CoachAttempt[]): string {
  const headings = [
    'Date and Time', 'Season', 'Activity', 'Assignment', 'Cycle', 'Assignment Due',
    'Timing', 'Player Number', 'Player', 'Situation', 'Difficulty', 'Teaching Categories',
    'Result', 'Attempt State', 'Score',
    'Tries', 'Positioning Time (seconds)', 'Sequence Result', 'Sequence Tries',
    'Sequence Time (seconds)', 'Selected Sequence', 'Abandon Reason', 'Run ID',
  ];
  const rows = attempts.map((attempt) => {
    const positioning = phaseOne(attempt);
    const sequence = lastSequenceStage(attempt);
    const outcome = attempt.outcome
      ?? (attempt.success === true ? 'passed' : attempt.success === false ? 'failed' : '');
    const timing = attempt.isLateCompletion
      ? 'Late completion'
      : attempt.isOverdue ? 'Overdue' : '';
    return [
      attempt.completedAt || attempt.startedAt || attempt.createdAt || attempt.ts || '',
      attempt.seasonName || '',
      attempt.activityType === 'assigned' ? 'Assigned practice' : 'Free play',
      attempt.assignmentTitle || '',
      attempt.assignmentCycleNumber || '',
      attempt.assignmentDueAt || '',
      timing,
      attempt.playerNumber,
      attempt.playerName,
      attempt.situationTitle || attempt.situationKey,
      attempt.difficulty || '',
      attempt.teachingCategories.join(' | '),
      outcome ? outcome.toUpperCase() : '',
      attempt.lifecycleStatus === 'incomplete' ? 'IN PROGRESS' : String(attempt.lifecycleStatus || '').toUpperCase(),
      positioning ? `${positioning.scoreCorrect}/${positioning.scoreTotal}` : '',
      positioning?.triesUsed ?? '',
      positioning?.elapsed ?? '',
      sequence ? (sequence.success ? 'PASS' : 'FAIL') : '',
      sequence?.triesUsed ?? '',
      sequence?.timeElapsed ?? '',
      sequence?.picked?.join(' -> ') || '',
      attempt.abandonReason || '',
      attempt.runId || '',
    ].map(csvCell).join(',');
  });
  return `\uFEFF${[headings.map(csvCell).join(','), ...rows].join('\r\n')}\r\n`;
}
