import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { requireOrgWorkspace } from '$lib/server/security/authorization';
import { designWorkspaces } from '$lib/server/security/design-scopes';

export const GET: RequestHandler = async (event) => {
  const user = await requireOrgWorkspace(event);
  const database = databaseFor(event);
  const workspaces = await designWorkspaces(database, user);
  const regions = workspaces.filter(scope => scope.type === 'region');
  const regionId = event.url.searchParams.get('region');
  if (regionId && !regions.some(region => region.id === regionId)) throw error(403, 'Region is outside your Training scope.');
  const visibleTeams = workspaces.filter(team => team.type === 'team' &&
    (user.role === 'admin' || regions.some(region => region.id === team.parent?.id)) &&
    (!regionId || regionId === team.parent?.id));
  const metrics = await database.all<{
    teamId: string; activeAssignments: number; assigned: number; completed: number; overdue: number;
  }>(`SELECT a.team_id AS teamId, COUNT(DISTINCT CASE WHEN a.status='active' THEN a.id END) AS activeAssignments,
      COUNT(r.player_id) AS assigned,
      COUNT(CASE WHEN r.status='completed' THEN 1 END) AS completed,
      COUNT(CASE WHEN a.status='active' AND r.status<>'completed' AND julianday(a.due_at)<julianday('now') THEN 1 END) AS overdue
    FROM practice_assignments a LEFT JOIN assignment_recipients r ON r.assignment_id=a.id AND r.withdrawn_at IS NULL
    WHERE a.status IN ('active','completed') AND a.closed_at IS NULL AND a.cancelled_at IS NULL
      AND a.team_id IN (SELECT value FROM json_each(?1))
    GROUP BY a.team_id`, [JSON.stringify(visibleTeams.map(team => team.id))]);
  const byTeam = new Map(metrics.map(row => [row.teamId, row]));
  return json({
    regions: regions.map(region => ({ id: region.id, name: region.name,
      organizationName: workspaces.find(scope => scope.type === 'organization' && scope.id === region.parent?.id)?.name })),
    teams: visibleTeams.map(team => ({ id: team.id, name: team.name, regionId: team.parent?.id,
      activeAssignments: 0, assigned: 0, completed: 0, overdue: 0, ...byTeam.get(team.id) })),
  }, { headers: { 'Cache-Control': 'no-store' } });
};
