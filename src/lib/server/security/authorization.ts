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
  if (roles && !roles.includes(user.role)) {
    throw error(403, 'You do not have permission to perform this action.');
  }
  return user;
}
