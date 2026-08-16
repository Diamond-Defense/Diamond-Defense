import { test, expect, request as playwrightRequest } from '@playwright/test';

function writeHeaders(origin, revision) {
  return {
    Origin: origin,
    ...(revision ? { 'If-Match': String(revision) } : {}),
  };
}

async function loginAdmin(request, origin) {
  const response = await request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { role: 'admin', password: 'admin' },
  });
  expect(response.ok()).toBeTruthy();
}

test.describe('record-level administration API', () => {
  test('uses revisions, archives records, manages members, and records audits', async ({ request, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const teamId = `phase-three-${suffix}`;
    const playerId = `${teamId}-player-7`;

    expect((await request.post('/api/admin/teams', {
      headers: { Origin: origin },
      data: { id: teamId, name: 'Unauthorized Team' },
    })).status()).toBe(401);

    await loginAdmin(request, origin);

    const createdResponse = await request.post('/api/admin/teams', {
      headers: { Origin: origin },
      data: { id: teamId, name: 'Phase Three Team', coachEmail: 'coach@example.com' },
    });
    expect(createdResponse.status()).toBe(201);
    const created = (await createdResponse.json()).record;
    expect(created).toEqual(expect.objectContaining({ id: teamId, revision: 1, active: true }));

    const updatedResponse = await request.put(`/api/admin/teams/${teamId}`, {
      headers: writeHeaders(origin, created.revision),
      data: { name: 'Phase Three Updated', coachEmail: 'updated@example.com' },
    });
    expect(updatedResponse.ok()).toBeTruthy();
    const updated = (await updatedResponse.json()).record;
    expect(updated).toEqual(expect.objectContaining({ id: teamId, revision: 2, name: 'Phase Three Updated' }));

    expect((await request.put(`/api/admin/teams/${teamId}`, {
      headers: writeHeaders(origin, created.revision),
      data: { name: 'Stale overwrite' },
    })).status()).toBe(409);

    const memberResponse = await request.post(`/api/admin/teams/${teamId}/members`, {
      headers: { Origin: origin },
      data: {
        userId: playerId,
        name: 'Phase Player',
        number: '7',
        role: 'player',
        password: '1234',
      },
    });
    expect(memberResponse.status()).toBe(201);
    const member = (await memberResponse.json()).record;
    expect(member).toEqual(expect.objectContaining({ playerId, revision: 1, active: true }));

    const memberUpdateResponse = await request.put(`/api/admin/teams/${teamId}/members/${playerId}`, {
      headers: writeHeaders(origin, member.revision),
      data: { name: 'Phase Player Updated', number: '17', role: 'player' },
    });
    const memberUpdated = (await memberUpdateResponse.json()).record;
    expect(memberUpdated).toEqual(expect.objectContaining({ number: '17', revision: 2 }));
    expect((await request.put(`/api/admin/teams/${teamId}/members/${playerId}`, {
      headers: writeHeaders(origin, member.revision),
      data: { name: 'Stale Player', number: '8' },
    })).status()).toBe(409);

    const archivedMemberResponse = await request.delete(`/api/admin/teams/${teamId}/members/${playerId}`, {
      headers: writeHeaders(origin, memberUpdated.revision),
    });
    const archivedMember = (await archivedMemberResponse.json()).record;
    expect(archivedMember).toEqual(expect.objectContaining({ revision: 3, active: false }));

    const restoredMemberResponse = await request.post(`/api/admin/teams/${teamId}/members/${playerId}/restore`, {
      headers: writeHeaders(origin, archivedMember.revision),
    });
    const restoredMember = (await restoredMemberResponse.json()).record;
    expect(restoredMember).toEqual(expect.objectContaining({ revision: 4, active: true }));

    expect((await request.put(`/api/admin/teams/${teamId}/members/${playerId}/password`, {
      headers: { Origin: origin },
      data: { password: 'new-pass-17' },
    })).ok()).toBeTruthy();

    const archivedTeamResponse = await request.delete(`/api/admin/teams/${teamId}`, {
      headers: writeHeaders(origin, updated.revision),
    });
    const archivedTeam = (await archivedTeamResponse.json()).record;
    expect(archivedTeam).toEqual(expect.objectContaining({ revision: 3, active: false }));

    const publicTeams = (await (await request.get('/api/teams/options')).json()).teams;
    expect(publicTeams.some((team) => team.id === teamId)).toBe(false);

    const adminTeams = (await (await request.get('/api/admin/teams?includeArchived=true')).json()).teams;
    expect(adminTeams).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: teamId, active: false }),
    ]));

    const restoredTeamResponse = await request.post(`/api/admin/teams/${teamId}/restore`, {
      headers: writeHeaders(origin, archivedTeam.revision),
    });
    const restoredTeam = (await restoredTeamResponse.json()).record;
    expect(restoredTeam).toEqual(expect.objectContaining({ revision: 4, active: true }));

    const playerRequest = await playwrightRequest.newContext({ baseURL });
    const playerLogin = await playerRequest.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { role: 'player', teamId, playerId, password: 'new-pass-17' },
    });
    expect(playerLogin.ok()).toBeTruthy();
    await playerRequest.dispose();

    const audit = await request.get('/api/admin/audit');
    expect(audit.ok()).toBeTruthy();
    expect((await audit.json()).entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'team', entityId: teamId, action: 'create' }),
      expect.objectContaining({ entityType: 'membership', entityId: `${teamId}:${playerId}` }),
    ]));

    expect((await request.delete(`/api/admin/teams/${teamId}`, {
      headers: writeHeaders(origin, restoredTeam.revision),
    })).ok()).toBeTruthy();
  });

  test('creates, updates, archives, and restores a situation without deleting it', async ({ request, baseURL }) => {
    const origin = new URL(baseURL).origin;
    await loginAdmin(request, origin);

    const templateResponse = await request.get('/api/situations');
    const template = (await templateResponse.json())[0];
    const key = `PHASE3-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const input = { ...template, key, title: 'Phase 3 Situation' };
    delete input.revision;
    delete input.active;
    delete input.archivedAt;

    const createResponse = await request.post('/api/situations', {
      headers: { Origin: origin },
      data: input,
    });
    expect(createResponse.status()).toBe(201);
    const created = (await createResponse.json()).record;
    expect(created).toEqual(expect.objectContaining({ key, revision: 1, active: true }));

    const updateResponse = await request.put(`/api/situations/${key}`, {
      headers: writeHeaders(origin, created.revision),
      data: { ...input, title: 'Phase 3 Situation Updated' },
    });
    const updated = (await updateResponse.json()).record;
    expect(updated).toEqual(expect.objectContaining({ revision: 2, title: 'Phase 3 Situation Updated' }));
    expect((await request.put(`/api/situations/${key}`, {
      headers: writeHeaders(origin, created.revision),
      data: input,
    })).status()).toBe(409);

    const archiveResponse = await request.delete(`/api/situations/${key}`, {
      headers: writeHeaders(origin, updated.revision),
    });
    const archived = (await archiveResponse.json()).record;
    expect(archived).toEqual(expect.objectContaining({ revision: 3, active: false }));
    expect((await (await request.get('/api/situations')).json()).some((item) => item.key === key)).toBe(false);

    const archivedList = (await (await request.get('/api/admin/situations')).json()).situations;
    expect(archivedList).toEqual(expect.arrayContaining([
      expect.objectContaining({ key, active: false, revision: 3 }),
    ]));

    const restoreResponse = await request.post(`/api/admin/situations/${key}/restore`, {
      headers: writeHeaders(origin, archived.revision),
    });
    const restored = (await restoreResponse.json()).record;
    expect(restored).toEqual(expect.objectContaining({ revision: 4, active: true }));

    expect((await request.delete(`/api/situations/${key}`, {
      headers: writeHeaders(origin, restored.revision),
    })).ok()).toBeTruthy();
  });
});
