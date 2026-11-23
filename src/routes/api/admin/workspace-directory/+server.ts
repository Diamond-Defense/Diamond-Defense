import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { databaseFor } from '$lib/server/database/context';
import { assertSameOrigin, directsOrganization, directsRegion, requireOrgWorkspace } from '$lib/server/security/authorization';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteTeamRepository } from '$lib/server/repositories/teams';
import type { AuthenticatedUser } from '$lib/server/security/sessions';
import type { SqliteDatabaseAdapter } from '$lib/server/database/adapter';
import { writeAudit } from '$lib/server/repositories/audit';
import { createPasswordHash, validateAccountPassword } from '$lib/server/security/passwords';

export const prerender = false;

export const GET: RequestHandler = async (event) => {
  const actor = await requireOrgWorkspace(event);
  const database = databaseFor(event);
  const [organizations, regions, teams] = await Promise.all([
    database.all<{ id: string; name: string }>('SELECT id, name FROM organizations ORDER BY name, id'),
    database.all<{ id: string; name: string; organizationId: string }>('SELECT id, name, organization_id AS organizationId FROM regions ORDER BY name, id'),
    database.all<{ id: string; name: string; regionId: string | null }>('SELECT id, name, region_id AS regionId FROM teams WHERE active = 1 ORDER BY name, id'),
  ]);
  const admin = actor.role === 'admin';
  const visibleRegions = regions.filter(region => admin || directsRegion(actor, region));
  const visibleTeams = teams.filter(team => admin || visibleRegions.some(region => region.id === team.regionId));
  const visibleOrganizations = organizations.filter(org => admin || directsOrganization(actor, org.id)
    || visibleRegions.some(region => region.organizationId === org.id));
  const managedIds = organizations.filter(org => directsOrganization(actor, org.id)).map(org => org.id);
  const parameters = [Number(admin), JSON.stringify(managedIds)];
  const [people, assignments, designerScopes] = await Promise.all([
    database.all(`WITH visible_staff AS (
      SELECT m.user_id FROM team_memberships m JOIN teams t ON t.id=m.team_id AND t.active=1
        JOIN regions r ON r.id=t.region_id
        WHERE m.active=1 AND m.team_role='coach' AND r.organization_id IN (SELECT value FROM json_each(?2))
      UNION
      SELECT w.user_id FROM workspace_assignments w LEFT JOIN regions r ON r.id=w.region_id
        WHERE COALESCE(w.organization_id, r.organization_id) IN (SELECT value FROM json_each(?2))
    )
    SELECT u.id, u.display_name AS name, u.username, u.role,
      CASE WHEN ?1=1 THEN COALESCE(p.publish_situations, 0) ELSE 0 END AS legacyPublishing
      FROM users u LEFT JOIN coach_permissions p ON p.user_id = u.id
      WHERE u.active=1 AND u.role='coach' AND (?1=1 OR u.id IN visible_staff)
      ORDER BY u.display_name COLLATE NOCASE, u.id`, parameters),
    database.all(`SELECT m.user_id AS userId, m.team_role AS role, m.team_id AS teamId,
      NULL AS regionId, NULL AS organizationId, r.organization_id AS staffOrganizationId, 'Team membership' AS source,
      w.can_design AS canDesign, NULL AS stagedDirectorId
      FROM team_memberships m JOIN teams t ON t.id=m.team_id AND t.active=1
      LEFT JOIN regions r ON r.id=t.region_id
      LEFT JOIN workspace_assignments w ON w.user_id=m.user_id AND w.team_id=m.team_id AND w.role='coach'
      WHERE m.active=1 AND m.team_role='coach' AND (?1=1 OR r.organization_id IN (SELECT value FROM json_each(?2)))
      UNION ALL
      SELECT w.user_id, w.role, NULL, w.region_id, w.organization_id, COALESCE(w.organization_id,r.organization_id),
        'Director appointment', w.can_design, w.id
      FROM workspace_assignments w LEFT JOIN regions r ON r.id=w.region_id
      WHERE w.role IN ('organization_director','regional_director')
        AND (?1=1 OR COALESCE(w.organization_id,r.organization_id) IN (SELECT value FROM json_each(?2)))
      ORDER BY role, teamId, regionId, organizationId`, parameters),
    database.all<{ id: string }>(`SELECT organization_id AS id FROM workspace_assignments
      WHERE user_id=?1 AND role='organization_director' AND can_design=1`, [actor.id]),
  ]);
  // Current accounts follow current responsibility. An unassigned account belongs
  // to its last membership scope, not every team it has ever represented.
  const historyTeams=await database.all<{id:string}>('SELECT id FROM teams WHERE region_id IN (SELECT value FROM json_each(?1))',[JSON.stringify(visibleRegions.map(region=>region.id))]);
  const scopedTeamIds=JSON.stringify(historyTeams.map(team=>team.id));
  const staffIds=JSON.stringify(people.map((person:any)=>person.id));
  const accounts=await database.all<{id:string;name:string;username:string;role:string;active:number;revision:number}>(`SELECT u.id,u.display_name AS name,u.username,u.role,u.active,u.revision
    FROM users u WHERE u.role IN ('player','coach') AND (
      ?1=1 OR u.id IN (SELECT value FROM json_each(?3))
      OR EXISTS (SELECT 1 FROM team_memberships m WHERE m.user_id=u.id AND m.active=1 AND m.team_id IN (SELECT value FROM json_each(?2)))
      OR (
        NOT EXISTS (SELECT 1 FROM team_memberships current_membership WHERE current_membership.user_id=u.id AND current_membership.active=1)
        AND NOT EXISTS (SELECT 1 FROM workspace_assignments appointment WHERE appointment.user_id=u.id)
        AND (SELECT latest_membership.team_id FROM team_memberships latest_membership WHERE latest_membership.user_id=u.id
             ORDER BY COALESCE(latest_membership.archived_at,latest_membership.created_at) DESC,latest_membership.created_at DESC,latest_membership.team_id DESC LIMIT 1) IN (SELECT value FROM json_each(?2))
      )
    ) ORDER BY u.display_name COLLATE NOCASE,u.id`,[Number(admin),scopedTeamIds,staffIds]);
  const accountMemberships=await database.all(`SELECT m.user_id AS userId,m.team_id AS teamId,m.team_role AS role,m.jersey_number AS number,m.active,m.revision,
      m.season_id AS seasonId,t.name AS teamName,t.active AS teamActive,r.organization_id AS organizationId
    FROM team_memberships m JOIN teams t ON t.id=m.team_id LEFT JOIN regions r ON r.id=t.region_id
    WHERE ?1=1 OR (m.team_id IN (SELECT value FROM json_each(?2)) AND m.user_id IN (SELECT value FROM json_each(?3)))`,[Number(admin),scopedTeamIds,JSON.stringify(accounts.map(account=>account.id))]);
  return json({
    organizations: visibleOrganizations, regions: visibleRegions, teams: visibleTeams,
    people, accounts, accountMemberships, assignments, designerOrganizationIds: designerScopes.map(scope => scope.id),
  }, { headers: { 'Cache-Control': 'no-store' } });
};

async function staffScope(database: SqliteDatabaseAdapter, actor: AuthenticatedUser, role: string, scopeId: string) {
  if (actor.role === 'admin') return null;
  if (role === 'organization_director') throw error(403, 'Only Platform Admin can manage Organization Director appointments.');
  const scope = await database.one<{ organizationId: string; canDesign: number }>(
    `SELECT r.organization_id AS organizationId, w.can_design AS canDesign
     FROM ${role === 'coach' ? 'teams t JOIN regions r ON r.id=t.region_id' : 'regions r'}
     JOIN workspace_assignments w ON w.organization_id=r.organization_id AND w.role='organization_director'
     WHERE w.user_id=?1 AND ${role === 'coach' ? 't.id=?2 AND t.active=1' : 'r.id=?2'}`, [actor.id, scopeId],
  );
  if (!scope) throw error(403, 'This assignment is outside your organization.');
  return scope;
}

async function staffBelongsToOrganization(database: SqliteDatabaseAdapter, userId: string, organizationId: string) {
  return database.one(`SELECT 1 FROM team_memberships m JOIN teams t ON t.id=m.team_id AND t.active=1
    JOIN regions r ON r.id=t.region_id
    WHERE m.user_id=?1 AND m.active=1 AND m.team_role='coach' AND r.organization_id=?2
    UNION ALL SELECT 1 FROM workspace_assignments w LEFT JOIN regions r ON r.id=w.region_id
    WHERE w.user_id=?1 AND w.role IN ('organization_director','regional_director')
      AND COALESCE(w.organization_id,r.organization_id)=?2 LIMIT 1`, [userId, organizationId]);
}

function requiredText(value: unknown, label: string) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 120) throw error(400, `Enter a valid ${label}.`);
  return text;
}

export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const actor = await requireOrgWorkspace(event);
  const database = databaseFor(event);
  const body = await event.request.json();
  const platformAdmin = actor.role === 'admin';
  if (!platformAdmin && !['place_team', 'create_region', 'rename_region', 'delete_region', 'stage_access', 'create_staff', 'remove_staged_director', 'remove_coach'].includes(body?.action)) {
    throw error(403, 'Only Platform Admin can perform this directory action.');
  }

  if (body?.action === 'remove_staged_director') {
    const assignmentId = requiredText(body.assignmentId, 'director appointment');
    if (!platformAdmin) {
      const appointment = await database.one<{ role: string; regionId: string }>(
        'SELECT role, region_id AS regionId FROM workspace_assignments WHERE id=?1', [assignmentId],
      );
      if (!appointment || appointment.role !== 'regional_director') throw error(403, 'Only regional appointments can be removed here.');
      await staffScope(database, actor, appointment.role, appointment.regionId);
    }
    const removed = await database.one(
      `DELETE FROM workspace_assignments WHERE id = ?1
        AND role IN ('organization_director', 'regional_director') RETURNING *`,
      [assignmentId],
    );
    if (!removed) throw error(404, 'Staged director appointment not found.');
    await writeAudit(database, actor.id, 'remove_staged_director', 'workspace_assignment', assignmentId, removed, null);
    return json({ assignmentId });
  }

  if (body?.action === 'remove_coach') {
    const teamId = requiredText(body.scopeId, 'team');
    const userId = requiredText(body.userId, 'staff account');
    await staffScope(database, actor, 'coach', teamId);
    try {
      const repository = new SqliteTeamRepository(database);
      const member = await repository.getMember(teamId, userId);
      if (member?.role !== 'coach') return json({ error: 'Active coach membership not found.' }, { status: 404 });
      return json({ record: await repository.setMemberActive(teamId, userId, false, member.revision, actor.id) });
    } catch (failure) {
      return repositoryErrorResponse(failure);
    }
  }

  if (body?.action === 'stage_access' || body?.action === 'create_staff') {
    const creatingStaff = body.action === 'create_staff';
    const userId = creatingStaff ? `staff-${crypto.randomUUID()}` : requiredText(body.userId, 'staff account');
    const scopeId = requiredText(body.scopeId, 'scope');
    const role = body.role;
    if (!['organization_director', 'regional_director', 'coach'].includes(role)) {
      return json({ error: 'Choose an available staff role.' }, { status: 400 });
    }
    if (typeof body.canDesign !== 'boolean') throw error(400, 'Choose Designer access.');
    const managed = await staffScope(database, actor, role, scopeId);
    if (managed && body.canDesign && !managed.canDesign) throw error(403, 'Organization Designer access is required to delegate Designer.');
    if (managed && !creatingStaff && !await staffBelongsToOrganization(database, userId, managed.organizationId)) {
      throw error(404, 'Staff account not found in this organization.');
    }
    if (!creatingStaff && !await database.one("SELECT id FROM users WHERE id = ?1 AND active = 1 AND role = 'coach'", [userId])) {
      throw error(404, 'Active staff account not found.');
    }
    if (role === 'coach' && !body.assignmentId) {
      const repository = new SqliteTeamRepository(database);
      try {
        if (creatingStaff) {
          const account = await repository.createMember(scopeId, {
            role: 'coach', name: body.name, password: body.password,
          }, actor.id, body.canDesign);
          return json({ userId: account.playerId, username: account.username, name: account.name }, { status: 201 });
        }
        if (!await repository.getMember(scopeId, userId)) {
          await repository.addExistingPlayer(scopeId, { userId, number: '' }, actor.id);
        }
      } catch (failure) {
        return repositoryErrorResponse(failure);
      }
    }
    const scope = role === 'organization_director' ? 'organization_id' : role === 'regional_director' ? 'region_id' : 'team_id';
    const scopeQuery = {
      organization_id: 'SELECT id FROM organizations WHERE id = ?1',
      region_id: 'SELECT id FROM regions WHERE id = ?1',
      team_id: `SELECT t.id FROM teams t JOIN team_memberships m ON m.team_id = t.id
        WHERE t.id = ?1 AND t.active = 1 AND m.user_id = ?2 AND m.active = 1 AND m.team_role = 'coach'`,
    }[scope];
    if (!await database.one(scopeQuery, role === 'coach' ? [scopeId, userId] : [scopeId])) {
      throw error(404, 'No eligible workspace for this role.');
    }
    const row = { userId, role, scopeId, canDesign: body.canDesign };
    if (creatingStaff) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 100) {
        return json({ error: 'Enter a staff name of 100 characters or fewer.' }, { status: 400 });
      }
      let password;
      try {
        password = validateAccountPassword(body.password);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Enter a valid password.' }, { status: 400 });
      }
      const credentials = await createPasswordHash(password);
      const now = new Date().toISOString();
      const assignmentId = crypto.randomUUID();
      await database.batch([
        {
          sql: `INSERT INTO users
            (id, username, display_name, role, password_hash, password_salt,
             password_iterations, active, revision, created_at, updated_at,
             must_change_password, password_changed_at)
            VALUES (?1, ?1, ?2, 'coach', ?3, ?4, ?5, 1, 1, ?6, ?6, 1, ?6)`,
          params: [userId, name, credentials.hash, credentials.salt, credentials.iterations, now],
        },
        {
          sql: `INSERT INTO workspace_assignments (id, user_id, role, ${scope}, can_design)
            VALUES (?1, ?2, ?3, ?4, ?5)`,
          params: [assignmentId, userId, role, scopeId, Number(row.canDesign)],
        },
      ]);
      const account = await database.one<{ username: string }>('SELECT username FROM users WHERE id = ?1', [userId]);
      await writeAudit(database, actor.id, 'create_staff', 'workspace_assignment', assignmentId, null, { ...row, name });
      return json({ ...row, name, username: account!.username }, { status: 201 });
    }
    const before = await database.one<{ id: string; canDesign: number }>(
      `SELECT id, can_design AS canDesign FROM workspace_assignments WHERE user_id = ?1 AND role = ?2 AND ${scope} = ?3`,
      [userId, role, scopeId],
    );
    if (managed && before?.canDesign && !managed.canDesign) throw error(403, 'Organization Designer access is required to change this grant.');
    const assignmentId = body.assignmentId;
    const saved = assignmentId
      ? await database.one<{ id: string }>(
          `UPDATE workspace_assignments SET can_design = ?5
           WHERE id = ?1 AND user_id = ?2 AND role = ?3 AND ${scope} = ?4 RETURNING id`,
          [requiredText(assignmentId, 'appointment'), userId, role, scopeId, Number(row.canDesign)],
        )
      : await database.one<{ id: string }>(
          `INSERT INTO workspace_assignments (id, user_id, role, ${scope}, can_design)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT DO UPDATE SET can_design = excluded.can_design RETURNING id`,
          [crypto.randomUUID(), userId, role, scopeId, Number(row.canDesign)],
        );
    if (!saved) return json({ error: 'This appointment was removed. Refresh the staff list.' }, { status: 409 });
    await writeAudit(database, actor.id, 'stage_access', 'workspace_assignment', saved!.id, before, row);
    return json(row);
  }

  if (body?.action === 'place_team') {
    const teamId = requiredText(body.teamId, 'team');
    const regionId = body.regionId === null ? null : requiredText(body.regionId, 'region');
    const before = await database.one<{ regionId: string | null }>(
      'SELECT region_id AS regionId FROM teams WHERE id = ?1 AND active = 1', [teamId],
    );
    if (!before) throw error(404, 'Active team not found.');
    if (regionId && !await database.one('SELECT id FROM regions WHERE id = ?1', [regionId])) {
      throw error(404, 'Region not found.');
    }
    if (!platformAdmin) {
      const regions = await database.all<{ id: string; organizationId: string }>(
        'SELECT id, organization_id AS organizationId FROM regions WHERE id IN (?1, ?2)', [before.regionId, regionId],
      );
      const source = regions.find(region => region.id === before.regionId);
      const destination = regions.find(region => region.id === regionId);
      if (!source || !destination || source.organizationId !== destination.organizationId ||
          !directsOrganization(actor, source.organizationId)) {
        throw error(403, 'Team moves require Organization Director access to both regions in the same organization.');
      }
    }
    if ('previousRegionId' in body && body.previousRegionId !== before.regionId) {
      throw error(409, 'The team region changed. Refresh the directory and review the move again.');
    }
    if (before.regionId === regionId) return json({ teamId, regionId });
    const update = await database.execute(
      `UPDATE teams SET region_id = ?2, revision = revision + 1, updated_at = ?3
        WHERE id = ?1 AND active = 1 AND region_id IS ?4`,
      [teamId, regionId, new Date().toISOString(), before.regionId],
    );
    if (!update.changes) throw error(409, 'The team changed. Reload the directory and try again.');
    await writeAudit(database, actor.id, 'place_team', 'team', teamId, before, { regionId });
    return json({ teamId, regionId });
  }

  if (['rename_organization', 'rename_region', 'delete_organization', 'delete_region', 'stage_access', 'create_staff', 'remove_staged_director', 'remove_coach'].includes(body?.action)) {
    const organization = body.action.endsWith('_organization');
    const kind = organization ? 'organization' : 'region';
    const table = organization ? 'organizations' : 'regions';
    const id = requiredText(body.id, kind);
    if (!platformAdmin) {
      const region = await database.one<{ organizationId: string }>(
        'SELECT organization_id AS organizationId FROM regions WHERE id = ?1', [id],
      );
      if (!region || !directsOrganization(actor, region.organizationId)) {
        throw error(403, 'Only the organization director can manage this region.');
      }
    }
    const before = await database.one<{ id: string; name: string }>(
      `SELECT id, name FROM ${table} WHERE id = ?1`, [id],
    );
    if (!before) return json({ error: organization ? 'Organization not found.' : 'Region not found.' }, { status: 404 });

    if (body.action.startsWith('rename_')) {
      const name = requiredText(body.name, 'name');
      if (name === before.name) return json(before);
      const row = await database.one(
        `UPDATE OR IGNORE ${table} SET name = ?2 WHERE id = ?1 RETURNING id, name`, [id, name],
      );
      if (!row) return json({ error: 'The name is already in use or the record was removed. Refresh and try again.' }, { status: 409 });
      await writeAudit(database, actor.id, 'rename', kind, id, before, row);
      return json(row);
    }

    const childCheck = organization
      ? 'SELECT 1 FROM regions WHERE organization_id = ?1'
      : 'SELECT 1 FROM teams WHERE region_id = ?1';
    const assignmentScope = organization ? 'organization_id' : 'region_id';
    const assignmentCheck = `SELECT 1 FROM workspace_assignments WHERE ${assignmentScope} = ?1`;
    const removed = await database.one(
      `DELETE FROM ${table} WHERE id = ?1 AND NOT EXISTS (${childCheck})
        AND NOT EXISTS (${assignmentCheck}) RETURNING id, name`, [id],
    );
    if (!removed) {
      if (await database.one(childCheck, [id])) {
        return json({ error: organization
          ? 'Remove the regions before deleting this organization.'
          : 'Move the teams out of this region before deleting it. Archived teams also count.' }, { status: 409 });
      }
      if (await database.one(assignmentCheck, [id])) {
        return json({ error: 'Remove the director appointments in People & access before deleting this workspace.' }, { status: 409 });
      }
      return json({ error: 'The workspace changed. Refresh the directory and try again.' }, { status: 409 });
    }
    await writeAudit(database, actor.id, 'delete', kind, id, removed, null);
    return json({ id });
  }

  const name = requiredText(body?.name, 'name');
  const id = crypto.randomUUID();
  if (body.action === 'create_organization') {
    await database.execute('INSERT INTO organizations (id, name) VALUES (?1, ?2)', [id, name]);
    const row = { id, name };
    await writeAudit(database, actor.id, 'create', 'organization', id, null, row);
    return json(row, { status: 201 });
  }
  if (body.action === 'create_region') {
    const organizationId = requiredText(body.organizationId, 'organization');
    if (!platformAdmin && !directsOrganization(actor, organizationId)) throw error(403, 'This organization is outside your scope.');
    if (!await database.one('SELECT id FROM organizations WHERE id = ?1', [organizationId])) {
      throw error(404, 'Organization not found.');
    }
    const inserted = await database.execute(
      'INSERT OR IGNORE INTO regions (id, name, organization_id) VALUES (?1, ?2, ?3)',
      [id, name, organizationId],
    );
    if (!inserted.changes) throw error(409, 'That organization already has a region with this name.');
    const row = { id, name, organizationId };
    await writeAudit(database, actor.id, 'create', 'region', id, null, row);
    return json(row, { status: 201 });
  }
  throw error(400, 'Choose a directory action.');
};
