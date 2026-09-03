import { error } from '@sveltejs/kit';
import type {
  AttemptOutcome,
  AttemptReportFilters,
  CoachAttempt,
  PhaseOneResult,
  SequenceStageResult,
} from '$lib/server/repositories/attempts';

const REPORT_OUTCOMES = new Set<AttemptOutcome>(['passed', 'failed', 'abandoned']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function parseAttemptReportFilters(searchParams: URLSearchParams): AttemptReportFilters {
  const playerId = String(searchParams.get('playerId') || '').trim();
  const seasonId = String(searchParams.get('seasonId') || '').trim();
  const situationKey = String(searchParams.get('situationKey') || '').trim();
  const outcome = String(searchParams.get('outcome') || '').trim() as AttemptOutcome | '';
  const dateFrom = String(searchParams.get('dateFrom') || '').trim();
  const dateTo = String(searchParams.get('dateTo') || '').trim();
  if (playerId.length > 100 || seasonId.length > 100 || situationKey.length > 100) {
    throw error(400, 'A report filter is too long.');
  }
  if (outcome && !REPORT_OUTCOMES.has(outcome)) {
    throw error(400, 'The result filter is invalid.');
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
    ...(situationKey ? { situationKey } : {}),
    ...(outcome ? { outcome } : {}),
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
    'Date and Time', 'Player Number', 'Player', 'Situation', 'Result', 'Score',
    'Tries', 'Positioning Time (seconds)', 'Sequence Result', 'Sequence Tries',
    'Sequence Time (seconds)', 'Selected Sequence', 'Abandon Reason', 'Run ID',
  ];
  const rows = attempts.map((attempt) => {
    const positioning = phaseOne(attempt);
    const sequence = lastSequenceStage(attempt);
    const outcome = attempt.outcome
      ?? (attempt.success === true ? 'passed' : attempt.success === false ? 'failed' : '');
    return [
      attempt.completedAt || attempt.createdAt || attempt.ts || '',
      attempt.playerNumber,
      attempt.playerName,
      attempt.situationTitle || attempt.situationKey,
      outcome ? outcome.toUpperCase() : '',
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
