import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteSeasonRepository } from '$lib/server/repositories/seasons';
import { requireUser } from '$lib/server/security/authorization';

export const prerender = false;

function cell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export const GET: RequestHandler = async (event) => {
  await requireUser(event, ['admin']);
  try {
    const exported = await new SqliteSeasonRepository(databaseFor(event)).exportSeason(
      event.params.teamId,
      event.params.seasonId,
    );
  const headings = [
    'Record Type', 'Season', 'Season Status', 'Player ID', 'Role', 'Player Number',
    'Player Name', 'Membership Status', 'Date and Time', 'Situation', 'Result',
    'Score', 'Tries', 'Completion Time (seconds)', 'Assignment ID', 'Run ID',
  ];
  const memberRows = exported.members.map((member) => [
    'membership', exported.season.name, exported.season.status, member.playerId,
    member.role, member.number, member.name, member.status, member.removedAt || member.joinedAt,
    '', '', '', '', '', '', '',
  ]);
  const attemptRows = exported.attempts.map((attempt) => [
    'attempt', exported.season.name, exported.season.status, attempt.playerId,
    'player', attempt.playerNumber, attempt.playerName, '', attempt.completedAt,
    `${attempt.situationKey} — ${attempt.situationTitle}`, attempt.outcome,
    attempt.total ? `${attempt.score ?? 0}/${attempt.total}` : '', attempt.triesUsed,
    attempt.elapsedSeconds, attempt.assignmentId || '', attempt.runId,
  ]);
  const csv = `\uFEFF${[headings, ...memberRows, ...attemptRows]
    .map((row) => row.map(cell).join(','))
    .join('\r\n')}\r\n`;
  const filename = exported.season.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="diamond-defense-${filename || 'season'}-archive.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
