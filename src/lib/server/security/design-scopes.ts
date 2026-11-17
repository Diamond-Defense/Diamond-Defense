import type { AuthenticatedUser } from '$lib/server/security/sessions';
import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';

export type ScopeType = 'global' | 'organization' | 'region' | 'team';

export interface LibraryScope {
  type: ScopeType;
  id: string;
}

export interface LibraryWorkspace extends LibraryScope {
  name: string;
  parent?: LibraryScope;
  canDesign: boolean;
}

const GLOBAL: LibraryScope = { type: 'global', id: '' };

export function sameLibrary(a: LibraryScope, b: LibraryScope): boolean {
  return a.type === b.type && a.id === b.id;
}

export async function designWorkspaces(database: SqliteDatabaseAdapter, user: AuthenticatedUser): Promise<LibraryWorkspace[]> {
  const [organizations, regions, teams, grants] = await Promise.all([
    database.all<{ id: string; name: string }>('SELECT id,name FROM organizations ORDER BY name,id'),
    database.all<{ id: string; name: string; organization_id: string }>('SELECT id,name,organization_id FROM regions ORDER BY name,id'),
    database.all<{ id: string; name: string; region_id: string | null }>('SELECT id,name,region_id FROM teams WHERE active=1 ORDER BY name,id'),
    database.all<{ role: string; organization_id: string | null; region_id: string | null; team_id: string | null; can_design: number }>(
      'SELECT role,organization_id,region_id,team_id,can_design FROM workspace_assignments WHERE user_id=?1', [user.id],
    ),
  ]);
  const admin = user.role === 'admin';
  const organizationIds = new Set(grants.filter(row => row.role === 'organization_director').map(row => row.organization_id));
  const regionalIds = new Set(grants.filter(row => row.role === 'regional_director').map(row => row.region_id));
  const managedRegions = new Set(regions.filter(row => admin || organizationIds.has(row.organization_id) || regionalIds.has(row.id)).map(row => row.id));
  return [
    ...(admin ? [{ ...GLOBAL, name: 'Global Library', canDesign: true }] : []),
    ...organizations.filter(row => admin || organizationIds.has(row.id)).map(row => ({
      type: 'organization' as const, id: row.id, name: row.name, parent: GLOBAL,
      canDesign: grants.some(grant => grant.organization_id === row.id && grant.can_design === 1),
    })),
    ...regions.filter(row => managedRegions.has(row.id)).map(row => ({
      type: 'region' as const, id: row.id, name: row.name, parent: { type: 'organization' as const, id: row.organization_id },
      canDesign: grants.some(grant => grant.region_id === row.id && grant.can_design === 1),
    })),
    ...teams.filter(row => admin || (row.region_id && managedRegions.has(row.region_id)) || user.coachedTeamIds?.includes(row.id)).map(row => ({
      type: 'team' as const, id: row.id, name: row.name,
      parent: row.region_id ? { type: 'region' as const, id: row.region_id } : undefined,
      canDesign: Boolean(user.coachedTeamIds?.includes(row.id) && grants.some(grant => grant.team_id === row.id && grant.can_design === 1)),
    })),
  ];
}

export async function parentLibrary(database: SqliteDatabaseAdapter, scope: LibraryScope): Promise<LibraryScope | null> {
  if (scope.type === 'organization') {
    const row = await database.one('SELECT id FROM organizations WHERE id=?1', [scope.id]);
    return row ? GLOBAL : null;
  }
  if (scope.type === 'region') {
    const row = await database.one<{ organization_id: string }>('SELECT organization_id FROM regions WHERE id=?1', [scope.id]);
    return row ? { type: 'organization', id: row.organization_id } : null;
  }
  if (scope.type === 'team') {
    const row = await database.one<{ region_id: string | null }>('SELECT region_id FROM teams WHERE id=?1 AND active=1', [scope.id]);
    return row?.region_id ? { type: 'region', id: row.region_id } : null;
  }
  return null;
}

export async function accessibleSituationRevision(database: SqliteDatabaseAdapter, scope: LibraryWorkspace, key: string, revision: number) {
  return database.one<{ payload_json: string; library_scope: ScopeType; library_id: string; current_revision: number }>(
    `SELECT v.payload_json,s.library_scope,s.library_id,s.revision AS current_revision
      FROM situation_versions v JOIN situations s ON s.key=v.situation_key AND s.active=1
      WHERE v.situation_key=?1 AND v.revision=?2 AND (
        s.revision=?2 AND ((s.library_scope=?3 AND s.library_id=?4) OR EXISTS (
          SELECT 1 FROM library_inheritance i
          WHERE i.situation_key=s.key AND i.scope_type=?3 AND i.scope_id=?4
        ))
      )`, [key, revision, scope.type, scope.id],
  );
}
