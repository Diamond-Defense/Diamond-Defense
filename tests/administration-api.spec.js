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

  test('gives each coach a team account and routes situation proposals through admin review', async ({ request, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const teamId = `coach-workflow-${suffix}`;
    const coachId = `${teamId}-coach-jordan`;
    const password = 'coach-test-4821';
    const situationKey = `COACH-${suffix}`;

    await loginAdmin(request, origin);
    const teamResponse = await request.post('/api/admin/teams', {
      headers: { Origin: origin },
      data: { id: teamId, name: 'Coach Workflow Team' },
    });
    expect(teamResponse.status()).toBe(201);
    const team = (await teamResponse.json()).record;

    const coachResponse = await request.post(`/api/admin/teams/${teamId}/members`, {
      headers: { Origin: origin },
      data: {
        userId: coachId,
        name: 'Coach Jordan',
        role: 'coach',
        password,
      },
    });
    expect(coachResponse.status()).toBe(201);
    expect((await coachResponse.json()).record).toEqual(expect.objectContaining({
      playerId: coachId,
      role: 'coach',
      active: true,
    }));

    const publicOptions = await request.get('/api/coaches/options');
    expect(publicOptions.ok()).toBeTruthy();
    expect((await publicOptions.json()).teams).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: teamId,
        roster: expect.arrayContaining([
          expect.objectContaining({ playerId: coachId, name: 'Coach Jordan' }),
        ]),
      }),
    ]));

    const coachRequest = await playwrightRequest.newContext({ baseURL });
    const login = await coachRequest.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { role: 'coach', teamId, coachId, password },
    });
    expect(login.ok()).toBeTruthy();
    expect((await login.json()).user).toEqual(expect.objectContaining({
      id: coachId,
      role: 'coach',
      teamId,
      teamName: 'Coach Workflow Team',
    }));

    const template = (await (await coachRequest.get('/api/situations')).json())[0];
    const proposal = { ...template, key: situationKey, title: 'Coach Proposed Situation' };
    delete proposal.revision;
    delete proposal.active;
    delete proposal.archivedAt;

    expect((await coachRequest.post('/api/situations', {
      headers: { Origin: origin },
      data: proposal,
    })).status()).toBe(403);
    expect((await coachRequest.post(`/api/admin/teams/${teamId}/members`, {
      headers: { Origin: origin },
      data: {
        userId: `${coachId}-second`,
        name: 'Unauthorized Coach',
        role: 'coach',
        password: 'not-allowed',
      },
    })).status()).toBe(403);

    const submissionResponse = await coachRequest.post('/api/situation-submissions', {
      headers: { Origin: origin },
      data: {
        situation: proposal,
        rationale: 'Add a new relay situation for team practice.',
      },
    });
    expect(submissionResponse.status()).toBe(201);
    const submission = (await submissionResponse.json()).record;
    expect(submission).toEqual(expect.objectContaining({
      situationKey,
      submissionType: 'create',
      status: 'pending',
      submittedBy: coachId,
      rationale: 'Add a new relay situation for team practice.',
    }));

    const ownSubmissions = await coachRequest.get('/api/situation-submissions');
    expect((await ownSubmissions.json()).submissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: submission.id, submittedBy: coachId }),
    ]));
    await coachRequest.dispose();

    const approval = await request.put(`/api/admin/situation-submissions/${submission.id}`, {
      headers: { Origin: origin },
      data: { decision: 'approve', notes: 'Approved for the playbook.' },
    });
    expect(approval.ok()).toBeTruthy();
    const approvalResult = await approval.json();
    expect(approvalResult.submission).toEqual(expect.objectContaining({ status: 'approved' }));
    expect(approvalResult.published).toEqual(expect.objectContaining({
      key: situationKey,
      title: 'Coach Proposed Situation',
      revision: 1,
    }));

    const coachUpdateRequest = await playwrightRequest.newContext({ baseURL });
    expect((await coachUpdateRequest.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { role: 'coach', teamId, coachId, password },
    })).ok()).toBeTruthy();
    const selectiveUpdate = {
      ...proposal,
      title: 'Selectively Approved Title',
      desc: 'This description should remain unpublished.',
    };
    const updateResponse = await coachUpdateRequest.post('/api/situation-submissions', {
      headers: { Origin: origin },
      data: {
        situation: selectiveUpdate,
        rationale: 'Clarify the title without changing player instructions.',
      },
    });
    expect(updateResponse.status()).toBe(201);
    const updateSubmission = (await updateResponse.json()).record;
    expect(updateSubmission).toEqual(expect.objectContaining({
      submissionType: 'update',
      baseRevision: 1,
    }));
    await coachUpdateRequest.dispose();

    const selectiveApproval = await request.put(
      `/api/admin/situation-submissions/${updateSubmission.id}`,
      {
        headers: { Origin: origin },
        data: {
          decision: 'approve',
          notes: 'Title approved; description retained.',
          acceptedFields: ['title'],
        },
      },
    );
    expect(selectiveApproval.ok()).toBeTruthy();
    const selectiveResult = await selectiveApproval.json();
    expect(selectiveResult.submission).toEqual(expect.objectContaining({
      status: 'approved',
      acceptedFields: ['title'],
    }));
    expect(selectiveResult.published).toEqual(expect.objectContaining({
      title: 'Selectively Approved Title',
      desc: proposal.desc,
      revision: 2,
    }));

    expect((await request.delete(`/api/situations/${situationKey}`, {
      headers: writeHeaders(origin, selectiveResult.published.revision),
    })).ok()).toBeTruthy();
    expect((await request.delete(`/api/admin/teams/${teamId}`, {
      headers: writeHeaders(origin, team.revision),
    })).ok()).toBeTruthy();
  });

  test('previews and atomically imports modern team CSV records', async ({ request, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const teamId = `csv-team-${suffix}`;
    const playerId = `${teamId}-sam-27`;
    const invalidTeamId = `csv-invalid-${suffix}`;
    const csv = [
      'record_type,action,team_id,team_name,contact_email,user_id,role,name,number,password',
      `member,upsert,${teamId},,,${playerId},player,Sam Rivera,27,7391`,
      `team,upsert,${teamId},CSV Import Team,csv@example.com,,,,,`,
    ].join('\n');

    expect((await request.post('/api/admin/team-import', {
      headers: { Origin: origin },
      data: { mode: 'preview', csv },
    })).status()).toBe(401);

    await loginAdmin(request, origin);
    const template = await request.get('/api/admin/team-import');
    expect(template.ok()).toBeTruthy();
    expect(template.headers()['content-disposition'])
      .toContain('diamond-defense-team-import-template.csv');
    expect(await template.text()).toContain('record_type,action,team_id');

    const previewResponse = await request.post('/api/admin/team-import', {
      headers: { Origin: origin },
      data: { mode: 'preview', csv },
    });
    expect(previewResponse.ok()).toBeTruthy();
    const preview = await previewResponse.json();
    expect(preview).toMatchObject({
      valid: true,
      format: 'modern',
      summary: { changes: 2, creates: 2, errors: 0 },
    });
    expect(preview.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, kind: 'member', userId: playerId, action: 'create' }),
      expect.objectContaining({ row: 3, kind: 'team', teamId, action: 'create' }),
    ]));
    expect(JSON.stringify(preview)).not.toContain('7391');
    expect((await request.get('/api/admin/teams?includeArchived=true').then((response) => response.json()))
      .teams.some((team) => team.id === teamId)).toBe(false);

    expect((await request.post('/api/admin/team-import', {
      headers: { Origin: origin },
      data: { mode: 'commit', csv, fingerprint: 'stale-preview' },
    })).status()).toBe(409);

    const commit = await request.post('/api/admin/team-import', {
      headers: { Origin: origin },
      data: { mode: 'commit', csv, fingerprint: preview.fingerprint },
    });
    expect(commit.ok()).toBeTruthy();
    expect((await commit.json()).summary).toMatchObject({ changes: 2, creates: 2 });

    const playerRequest = await playwrightRequest.newContext({ baseURL });
    const playerLogin = await playerRequest.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { role: 'player', teamId, playerId, password: '7391' },
    });
    expect(playerLogin.ok()).toBeTruthy();
    await playerRequest.dispose();

    const updateCsv = [
      'record_type,action,team_id,team_name,contact_email,user_id,role,name,number,password',
      `team,upsert,${teamId},CSV Import Team,updated-csv@example.com,,,,,`,
      `member,upsert,${teamId},,,${playerId},player,Sam Rivera Updated,27,`,
    ].join('\n');
    const updatePreview = await (await request.post('/api/admin/team-import', {
      headers: { Origin: origin },
      data: { mode: 'preview', csv: updateCsv },
    })).json();
    expect(updatePreview).toMatchObject({ valid: true, summary: { updates: 2, changes: 2 } });
    expect((await request.post('/api/admin/team-import', {
      headers: { Origin: origin },
      data: { mode: 'commit', csv: updateCsv, fingerprint: updatePreview.fingerprint },
    })).ok()).toBeTruthy();
    const preservedPasswordRequest = await playwrightRequest.newContext({ baseURL });
    expect((await preservedPasswordRequest.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { role: 'player', teamId, playerId, password: '7391' },
    })).ok()).toBeTruthy();
    await preservedPasswordRequest.dispose();

    const invalidCsv = [
      'record_type,action,team_id,team_name,contact_email,user_id,role,name,number,password',
      `team,upsert,${invalidTeamId},Invalid Import Team,,,,,,`,
      `member,upsert,${invalidTeamId},,,${invalidTeamId}-player,player,No Password,9,`,
    ].join('\n');
    const invalidPreview = await request.post('/api/admin/team-import', {
      headers: { Origin: origin },
      data: { mode: 'preview', csv: invalidCsv },
    });
    const invalid = await invalidPreview.json();
    expect(invalid.valid).toBe(false);
    expect(invalid.summary.errors).toBe(1);
    expect((await request.post('/api/admin/team-import', {
      headers: { Origin: origin },
      data: { mode: 'commit', csv: invalidCsv, fingerprint: invalid.fingerprint },
    })).status()).toBe(422);
    const allTeams = (await (await request.get('/api/admin/teams?includeArchived=true')).json()).teams;
    expect(allTeams.some((team) => team.id === invalidTeamId)).toBe(false);

    const importedTeam = allTeams.find((team) => team.id === teamId);
    expect(importedTeam).toEqual(expect.objectContaining({ name: 'CSV Import Team', active: true }));
    expect((await request.delete(`/api/admin/teams/${teamId}`, {
      headers: writeHeaders(origin, importedTeam.revision),
    })).ok()).toBeTruthy();
  });
});
