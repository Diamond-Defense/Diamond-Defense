import { error, type RequestEvent } from '@sveltejs/kit';
import { databaseFor } from '$lib/server/database/context';
import {
  currentUser,
  type AuthenticatedUser,
} from '$lib/server/security/sessions';

export function assertSameOrigin(event: RequestEvent): void {
  const origin = event.request.headers.get('origin');
  if (origin && origin !== event.url.origin) {
    throw error(403, 'Cross-origin writes are not allowed.');
  }
}

export async function requireUser(
  event: RequestEvent,
  roles?: AuthenticatedUser['role'][],
): Promise<AuthenticatedUser> {
  const user = await currentUser(databaseFor(event), event.cookies);
  if (!user) throw error(401, 'Login required.');
  if (user.mustChangePassword) {
    throw error(403, 'Change your temporary password before continuing.');
  }
  if (roles && !roles.includes(user.role)) {
    throw error(403, 'You do not have permission to perform this action.');
  }
  return user;
}

export async function requireOrgWorkspace(event: RequestEvent): Promise<AuthenticatedUser> {
  const user = await requireUser(event, ['admin', 'coach']);
  if (user.role !== 'admin' && !user.directorScopes?.length) throw error(403, 'Director access is required.');
  return user;
}

export function directsOrganization(user: AuthenticatedUser, id: string): boolean {
  return Boolean(user.directorScopes?.some(scope => scope.role === 'organization_director' && scope.organizationId === id));
}

export function directsRegion(user: AuthenticatedUser, region: { id: string; organizationId: string }): boolean {
  return directsOrganization(user, region.organizationId) ||
    Boolean(user.directorScopes?.some(scope => scope.role === 'regional_director' && scope.regionId === region.id));
}

export async function directsTeam(event: RequestEvent, user: AuthenticatedUser, teamId: string): Promise<boolean> {
  if (!user.directorScopes?.length) return false;
  const region = await databaseFor(event).one<{ id: string; organizationId: string }>(
    'SELECT r.id, r.organization_id AS organizationId FROM teams t JOIN regions r ON r.id = t.region_id WHERE t.id = ?1',
    [teamId],
  );
  return Boolean(region && directsRegion(user, region));
}

export async function requireDirectorTeamManager(event: RequestEvent, teamId: string): Promise<AuthenticatedUser> {
  const user = await requireOrgWorkspace(event);
  if (user.role !== 'admin' && !await directsTeam(event, user, teamId)) {
    throw error(403, 'This team is outside your director scope.');
  }
  return user;
}

export async function requireTeamManager(
  event: RequestEvent,
  teamId: string,
): Promise<AuthenticatedUser> {
  const user = await requireUser(event, ['coach', 'admin']);
  if (user.role === 'coach' && !user.coachedTeamIds?.includes(teamId) && !await directsTeam(event, user, teamId)) {
    throw error(403, 'Coaches may only administer their own team.');
  }
  return user;
}

// Coaching memberships and director scope also authorize team training.
export async function requireTrainingManager(event: RequestEvent, teamId: string): Promise<AuthenticatedUser> {
 const user = await requireUser(event, ['coach','admin']);
 if (!teamId || (user.role !== 'admin' && !user.coachedTeamIds?.includes(teamId) && !await directsTeam(event, user, teamId)))
   throw error(403, 'You do not have training access to this team.');
 return user;
}
export async function requirePracticeAssignmentManager(event: RequestEvent, teamId: string): Promise<AuthenticatedUser> {
  const user = await requireTrainingManager(event, teamId);
  if (user.role === 'admin' || user.coachedTeamIds?.includes(teamId)) return user;
  const team = await databaseFor(event).one<{ region_id: string | null }>(
    'SELECT region_id FROM teams WHERE id=?1 AND active=1', [teamId],
  );
  if (user.directorScopes?.some(scope => scope.role === 'regional_director' && scope.regionId === team?.region_id)) return user;
  throw error(403, 'A coach or regional director for this team must manage assignments.');
}

export async function requireSituationPublisher(event: RequestEvent): Promise<AuthenticatedUser> {
 const user = await requireUser(event, ['coach','admin']);
 if (user.role !== 'admin') throw error(403, 'Global publication requires Platform Admin. Use Design for scoped publishing.');
 return user;
}
