import { json } from '@sveltejs/kit';
import teams from '../../../teams.json';

export const prerender = true;

export function GET() {
  return json({
    version: teams.version,
    teams: teams.teams.map((team) => ({
      id: team.id,
      name: team.name,
      coachEmail: team.coachEmail,
      roster: team.roster.map((player) => ({
        name: player.name,
        number: player.number,
        playerId: player.playerId,
      })),
    })),
  });
}
