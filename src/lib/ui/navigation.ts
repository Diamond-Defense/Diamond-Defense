// A single permission model for the application shell and future sidebar.
// API authorization remains server-owned; visibility is not an access grant.
export function canAccessWorkspace(workspace: StaffWorkspace, user: WorkspaceAccount | null): boolean {
  if (workspace === 'field') return true;
  if (!user || user.mustChangePassword || user.role === 'player') return false;
  if (workspace === 'org') return user.role === 'admin' || Boolean(user.directorScopes?.length);
  if (workspace === 'training') return user.role === 'admin' ||
    Boolean(user.directorScopes?.length || user.coachedTeamIds?.length || user.teamId);
  return true;
}

export const workspaceLabels: Record<StaffWorkspace, string> = {
  field: 'Field', org: 'Org workspace', training: 'Training workspace', design: 'Design workspace',
};
