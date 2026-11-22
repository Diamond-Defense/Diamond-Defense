import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { requireTrainingManager } from '$lib/server/security/authorization';
import { SqliteAttemptRepository } from '$lib/server/repositories/attempts';
import { SqlitePracticeAssignmentRepository } from '$lib/server/repositories/practice-assignments';

export const prerender = false;
export const GET: RequestHandler = async event => {
  const teamId = event.params.teamId;
  await requireTrainingManager(event, teamId);
  const requestedDays = Number(event.url.searchParams.get('days') || 14);
  const days = [7,14,30].includes(requestedDays) ? requestedDays : 14;
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days + 1);
  start.setUTCHours(0,0,0,0);
  const since = start.toISOString();
  const filters = {dateFrom:since.slice(0,10)};
  const db = databaseFor(event);
  const attempts = new SqliteAttemptRepository(db);
  const practices = new SqlitePracticeAssignmentRepository(db);
  const [players, active, coachingFocus, recent, insights] = await Promise.all([
    db.all<{
      id:string;name:string;number:string;attempts:number;completedPlays:number;
      positioningAccuracy:number|null;lastActivity:string|null;pending:number;completed:number;overdue:number;
    }>(`WITH activity AS (
        SELECT player_id,COUNT(*) AS attempts,
          SUM(CASE WHEN outcome IN ('passed','failed') THEN 1 ELSE 0 END) AS completed_plays,
          AVG(CASE WHEN outcome IN ('passed','failed') THEN
            100.0 * COALESCE(json_extract(payload_json,'$.phase1.scoreCorrect'),
              json_extract(payload_json,'$.phase1ScoreCorrect'),CASE WHEN phase=1 THEN score END)
            / NULLIF(COALESCE(json_extract(payload_json,'$.phase1.scoreTotal'),
              json_extract(payload_json,'$.phase1ScoreTotal'),CASE WHEN phase=1 THEN total END),0)
          END) AS accuracy,
          MAX(COALESCE(completed_at,started_at,created_at)) AS last_activity
        FROM attempts WHERE team_id=?1 AND created_at>=?2 GROUP BY player_id
      ), work AS (
        SELECT ar.player_id,
          SUM(CASE WHEN ar.status='completed' THEN 0 ELSE 1 END) AS pending,
          SUM(CASE WHEN ar.status='completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN ar.status<>'completed' AND pa.due_at<?3 THEN 1 ELSE 0 END) AS overdue
        FROM assignment_recipients ar JOIN practice_assignments pa ON pa.id=ar.assignment_id
        WHERE pa.team_id=?1 AND pa.status IN ('active','completed')
          AND pa.closed_at IS NULL AND pa.cancelled_at IS NULL AND ar.withdrawn_at IS NULL
        GROUP BY ar.player_id
      ) SELECT DISTINCT u.id,u.display_name AS name,m.jersey_number AS number,
        COALESCE(a.attempts,0) AS attempts,COALESCE(a.completed_plays,0) AS completedPlays,
        a.accuracy AS positioningAccuracy,a.last_activity AS lastActivity,
        COALESCE(w.pending,0) AS pending,COALESCE(w.completed,0) AS completed,COALESCE(w.overdue,0) AS overdue
      FROM team_memberships m JOIN users u ON u.id=m.user_id
      JOIN team_seasons s ON s.id=m.season_id AND s.status='active'
      LEFT JOIN activity a ON a.player_id=u.id LEFT JOIN work w ON w.player_id=u.id
      WHERE m.team_id=?1 AND m.team_role='player' AND m.active=1 AND u.active=1
      ORDER BY CAST(m.jersey_number AS INTEGER),u.display_name`, [teamId,since,now.toISOString()]),
    practices.listForTeam(teamId,1,5,{view:'active',sort:'due'}),
    db.all<{situationKey:string;situationTitle:string;failed:number;failedPlayers:number;unfinished:number}>(
      `SELECT situation_key AS situationKey,MAX(situation_title) AS situationTitle,
        SUM(CASE WHEN outcome='failed' THEN 1 ELSE 0 END) AS failed,
        COUNT(DISTINCT CASE WHEN outcome='failed' THEN player_id END) AS failedPlayers,
        SUM(CASE WHEN outcome='abandoned' THEN 1 ELSE 0 END) AS unfinished
       FROM attempts WHERE team_id=?1 AND created_at>=?2
       GROUP BY situation_key HAVING SUM(CASE WHEN outcome='failed' THEN 1 ELSE 0 END)>=2
       ORDER BY failedPlayers DESC,failed DESC,situation_key LIMIT 3`,[teamId,since]),
    attempts.listFilteredForTeam(teamId,filters,6),
    attempts.developmentInsightsForTeam(teamId,filters),
  ]);
  return json({days,since,updatedAt:now.toISOString(),players,activePractices:active.assignments,
    activePracticeCount:active.total,coachingFocus,recentAttempts:recent,insights},
    {headers:{'Cache-Control':'private, no-store'}});
};
