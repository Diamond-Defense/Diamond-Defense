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
    data: { role: 'admin', password: 'password' },
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
      data: { id: teamId, name: 'Phase Three Team', seasonName: 'Spring 2027' },
    });
    expect(createdResponse.status()).toBe(201);
    const created = (await createdResponse.json()).record;
    expect(created).toEqual(expect.objectContaining({ id: teamId, revision: 1, active: true }));

    const updatedResponse = await request.put(`/api/admin/teams/${teamId}`, {
      headers: writeHeaders(origin, created.revision),
      data: { name: 'Phase Three Updated' },
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
        password: 'Temp-1234',
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
    const input = {
      ...template,
      key,
      title: 'Phase 3 Situation',
      category: 'Extra-base hits',
      primaryCategory: 'cutoffs-relays',
      relatedCategories: ['backups-rotations', 'base-coverage'],
      difficulty: 'advanced',
    };
    delete input.revision;
    delete input.active;
    delete input.archivedAt;

    const ambiguousCreate = await request.post('/api/situations', {
      headers: { Origin: origin },
      data: {
        ...input,
        key: `${key}-review`,
        batterAdvance: 0,
        runnersOn: { first: false, second: false, third: false },
        playOutcome: {
          result: 'groundout',
          batterResult: 'out',
          outsRecorded: 1,
          batterOutType: 'batter_first',
          batterOutOrder: 1,
          reviewStatus: 'needs_review',
        },
        runnerOutcomes: [],
      },
    });
    expect(ambiguousCreate.status()).toBe(400);
    expect((await ambiguousCreate.json()).error).toContain('Confirm the play and runner outcomes');

    const createResponse = await request.post('/api/situations', {
      headers: { Origin: origin },
      data: input,
    });
    expect(createResponse.status()).toBe(201);
    const created = (await createResponse.json()).record;
    expect(created).toEqual(expect.objectContaining({
      key,
      displayCode: expect.stringMatching(/^S\d+$/),
      revision: 1,
      active: true,
      category: 'Extra-base hits',
      primaryCategory: 'cutoffs-relays',
      relatedCategories: ['backups-rotations', 'base-coverage'],
      difficulty: 'advanced',
    }));

    const updateResponse = await request.put(`/api/situations/${key}`, {
      headers: writeHeaders(origin, created.revision),
      data: { ...input, title: 'Phase 3 Situation Updated' },
    });
    const updated = (await updateResponse.json()).record;
    expect(updated).toEqual(expect.objectContaining({
      revision: 2,
      title: 'Phase 3 Situation Updated',
      displayCode: created.displayCode,
    }));
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
    expect(restored).toEqual(expect.objectContaining({
      revision: 4,
      active: true,
      displayCode: created.displayCode,
    }));

    expect((await request.delete(`/api/situations/${key}`, {
      headers: writeHeaders(origin, restored.revision),
    })).ok()).toBeTruthy();
  });

  test('new coaches have Training access without Designer and retired proposal writes are rejected', async ({ request, baseURL }) => {
    const headers={Origin:new URL(baseURL).origin};
    await loginAdmin(request,headers.Origin);
    const id=`coach-workflow-${crypto.randomUUID()}`;
    const created=await request.post('/api/admin/teams',{headers,data:{id,name:id}});
    expect(created.status()).toBe(201);const team=(await created.json()).record;
    const member=await request.post(`/api/admin/teams/${id}/members`,{headers,data:{userId:id+'-coach',name:'Coach Jordan',role:'coach',password:'Initial-4821'}});
    expect(member.status()).toBe(201);
    const coach=await playwrightRequest.newContext({baseURL});
    try {
      const login=await coach.post('/api/auth/login',{headers,data:{role:'coach',teamId:id,coachId:id+'-coach',password:'Initial-4821'}});
      expect((await login.json()).user).toMatchObject({mustChangePassword:true,canAccessDesign:false});
      expect((await coach.get('/api/training/scopes')).status()).toBe(403);
      expect((await coach.put('/api/auth/password',{headers,data:{currentPassword:'Initial-4821',newPassword:'Permanent-4821'}})).ok()).toBe(true);
      const scopes=await coach.get('/api/training/scopes');expect(scopes.ok()).toBe(true);
      expect((await scopes.json()).workspaces).toEqual(expect.arrayContaining([expect.objectContaining({type:'team',id})]));
      expect((await coach.get('/api/design')).status()).toBe(403);
      expect((await coach.post('/api/situations',{headers,data:{}})).status()).toBe(403);
      const retired=await coach.post('/api/situation-submissions',{headers,data:{}});
      expect(retired.status()).toBe(410);expect((await retired.json()).error).toContain('parent library in Design');
    } finally {
      await coach.dispose();
      await request.delete(`/api/admin/teams/${id}`,{headers:{...headers,'If-Match':String(team.revision)}});
    }
  });

  test('CSV generates stable IDs only for new members with blank IDs', async ({ request, baseURL }) => {
    const origin = new URL(baseURL).origin;
    await loginAdmin(request, origin);
    const teamId = `csv-auto-${Date.now()}`;
    const header = 'record_type,action,team_id,team_name,season_name,user_id,role,name,number,password';
    const csv = [header,
      `team,upsert,${teamId},Generated IDs ${teamId},Spring 2027,,,,,`,
      `member,upsert,${teamId},,,,player,New Player,31,Temp-7391`,
      `member,upsert,${teamId},,,,coach,New Coach,,Temp-7391`,
    ].join('\n');
    const previewCsv = async (content) => {
      const response = await request.post('/api/admin/team-import', {
        headers: { Origin: origin }, data: { mode: 'preview', csv: content },
      });
      expect(response.ok()).toBeTruthy();
      return response.json();
    };
    const preview = await previewCsv(csv);
    expect(preview.valid).toBe(true);
    const members = preview.operations.filter(row => row.kind === 'member');
    expect(members).toHaveLength(2);
    expect(new Set(members.map(row => row.userId)).size).toBe(2);
    for (const member of members) expect(member.userId).toMatch(/^member-[a-f0-9]{64}$/);
    expect((await previewCsv(csv)).fingerprint).toBe(preview.fingerprint);
    const committed = await request.post('/api/admin/team-import', {
      headers: { Origin: origin }, data: { mode: 'commit', csv, fingerprint: preview.fingerprint },
    });
    expect(committed.ok()).toBeTruthy();
    const teams = await (await request.get('/api/admin/teams?includeArchived=true')).json();
    expect(teams.teams.find(team => team.id === teamId).roster.map(member => member.playerId).sort())
      .toEqual(members.map(member => member.userId).sort());
    expect((await previewCsv(csv)).valid).toBe(false);
    const archive = await previewCsv([header, `member,archive,${teamId},,,,coach,New Coach,,`].join('\n'));
    expect(archive.valid).toBe(false);
    expect(JSON.stringify(archive.issues)).toContain('user_id is required');
    const updated = await previewCsv([header,
      `member,upsert,${teamId},,,${members[0].userId},player,Updated Player,31,`,
    ].join('\n'));
    expect(updated.valid).toBe(true);
    expect(updated.operations[0].action).toBe('update');
    const duplicate = await previewCsv([header,
      `member,upsert,${teamId},,,,coach,Another Coach,,Temp-7391`,
      `member,upsert,${teamId},,,,coach,Another Coach,,Temp-7391`,
    ].join('\n'));
    expect(duplicate.valid).toBe(false);
    expect(JSON.stringify(duplicate.issues)).toContain('more than once');
  });

  test('previews and atomically imports modern team CSV records', async ({ request, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const teamId = `csv-team-${suffix}`;
    const playerId = `${teamId}-sam-27`;
    const invalidTeamId = `csv-invalid-${suffix}`;
    const csv = [
      'record_type,action,team_id,team_name,season_name,user_id,role,name,number,password',
      `member,upsert,${teamId},,,${playerId},player,Sam Rivera,27,Temp-7391`,
      `team,upsert,${teamId},CSV Import Team,Spring 2027,,,,,`,
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
    expect(JSON.stringify(preview)).not.toContain('Temp-7391');
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
      data: { role: 'player', teamId, playerId, password: 'Temp-7391' },
    });
    expect(playerLogin.ok()).toBeTruthy();
    await playerRequest.dispose();

    const updateCsv = [
      'record_type,action,team_id,team_name,season_name,user_id,role,name,number,password',
      `team,upsert,${teamId},CSV Import Team,Spring 2027,,,,,`,
      `member,upsert,${teamId},,,${playerId},player,Sam Rivera Updated,27,`,
    ].join('\n');
    const updatePreview = await (await request.post('/api/admin/team-import', {
      headers: { Origin: origin },
      data: { mode: 'preview', csv: updateCsv },
    })).json();
    expect(updatePreview).toMatchObject({
      valid: true,
      summary: { updates: 1, unchanged: 1, changes: 1 },
    });
    expect((await request.post('/api/admin/team-import', {
      headers: { Origin: origin },
      data: { mode: 'commit', csv: updateCsv, fingerprint: updatePreview.fingerprint },
    })).ok()).toBeTruthy();
    const preservedPasswordRequest = await playwrightRequest.newContext({ baseURL });
    expect((await preservedPasswordRequest.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { role: 'player', teamId, playerId, password: 'Temp-7391' },
    })).ok()).toBeTruthy();
    await preservedPasswordRequest.dispose();

    const invalidCsv = [
      'record_type,action,team_id,team_name,season_name,user_id,role,name,number,password',
      `team,upsert,${invalidTeamId},Invalid Import Team,Spring 2027,,,,,`,
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


test('situation transfer exports published records and reviews imports without writing', async ({ request, baseURL }) => {
  const origin = new URL(baseURL).origin;
  expect((await request.get('/api/admin/situations/transfer')).status()).toBe(401);
  await loginAdmin(request, origin);
  const exported = await request.get('/api/admin/situations/transfer');
  expect(exported.ok()).toBeTruthy();
  const bundle = await exported.json();
  expect(bundle.format).toBe('diamond-defence-situations');
  expect(bundle.situations.length).toBeGreaterThan(0);
  expect(bundle.situations[0]).not.toHaveProperty('revision');
  const original = bundle.situations[0];
  const review = async (situations) => {
    const response = await request.post('/api/admin/situations/transfer', {
      headers: { Origin: origin }, data: { ...bundle, situations },
    });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).rows;
  };
  expect((await review([original]))[0].status).toBe('unchanged');
  const changed = { ...original, title: 'Transfer review only', hit: { ...original.hit, x: original.hit.x + 1 } };
  const rows = await review([changed]);
  expect(rows[0].status).toBe('changed');
  expect(rows[0].changes.map(item => item.field)).toEqual(expect.arrayContaining(['title', 'hit']));
  const duplicateA = { ...original, key: 'transfer-conflict-a', title: 'Import conflict fixture', audience: { staffVariant: 'Review variant' } };
  const duplicateB = { ...duplicateA, key: 'transfer-conflict-b', outs: 2, runnersOn: { first: true, second: false, third: false } };
  const duplicates = await review([duplicateA, duplicateB]);
  expect(duplicates.every(row => row.status === 'new')).toBeTruthy();
  expect((await review([{ ...original, key: 'transfer-destination-conflict' }]))[0].status).toBe('new');
  const fresh = await (await request.get('/api/admin/situations/transfer')).json();
  expect(fresh.situations.find(item => item.key === original.key)).toEqual(original);
  expect((await review([original, original])).every(item => item.status === 'conflict')).toBeTruthy();
  expect((await review([{ ...original, key: `transfer-${Date.now()}`, title: `New transfer ${Date.now()}`, displayCode: undefined }]))[0].status).toBe('new');
  expect((await review([{ ...original, key: `transfer-${Date.now()}` }]))[0].status).toBe('new');
  expect((await review([{ ...original, hit: null }]))[0].status).toBe('conflict');
  const invalid = await request.post('/api/admin/situations/transfer', { headers: { Origin: origin }, data: { version: 99 } });
  expect(invalid.status()).toBe(400);
});

test('automatic variation tags and library order preserve record identities', async ({ request, baseURL }) => {
  const origin = new URL(baseURL).origin;
  await loginAdmin(request, origin);
  const template = (await (await request.get('/api/situations')).json())[0];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const title = `Variant test ${suffix}`;
  const keys = [];
  let originalOrder;
  try {
    const create = async (key, audience, name = title) => request.post('/api/situations', {headers:{Origin:origin},data:{...template,key,title:name,audience,variationNumber:undefined,variationTagged:false}});
    const first = await create(`variant-a-${suffix}`, {});
    expect(first.status()).toBe(201); keys.push((await first.json()).record.key);
    const sameName = await create(`variant-b-${suffix}`, {staffVariant:'Standard'}, `  ${title.toUpperCase()}  `);
    expect(sameName.status()).toBe(201);
    const sameRecord=(await sameName.json()).record; keys.push(sameRecord.key);
    expect(sameRecord.variationNumber).toBe(2);
    const second = await create(`variant-c-${suffix}`, {staffVariant:'Alternate approach'});
    expect(second.status()).toBe(201); keys.push((await second.json()).record.key);
    const library = await (await request.get('/api/admin/situations/order')).json();
    originalOrder = library.situations.map(item=>item.key);
    const reversed = [...originalOrder].reverse();
    const save = await request.put('/api/admin/situations/order',{headers:{Origin:origin},data:{keys:reversed,revision:library.revision}});
    expect(save.ok()).toBeTruthy();
    expect((await (await request.get('/api/admin/situations/order')).json()).situations.map(item=>item.key)).toEqual(reversed);
    expect((await request.put('/api/admin/situations/order',{headers:{Origin:origin},data:{keys:originalOrder,revision:library.revision}})).status()).toBe(409);
    const unchanged = (await (await request.get('/api/situations')).json()).find(item=>item.key===keys[0]);
    expect(unchanged.variationNumber).toBe(1);
    expect(unchanged.variationTagged).toBe(true);
    expect(unchanged.revision).toBe(1);
    expect(unchanged.audience).toEqual({});
  } finally {
    if(originalOrder){const state=await (await request.get('/api/admin/situations/order')).json();const response=await request.put('/api/admin/situations/order',{headers:{Origin:origin},data:{keys:originalOrder,revision:state.revision}});expect(response.ok()).toBeTruthy();}
    for(const key of keys){const current=(await (await request.get('/api/situations')).json()).find(item=>item.key===key);if(current)expect((await request.delete(`/api/situations/${key}`,{headers:{Origin:origin,'If-Match':String(current.revision)}})).ok()).toBeTruthy();}
  }
});


test('variation reservations survive deletion and resolve simultaneous imported tags', async ({ request, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const headers = { Origin: origin };
  await loginAdmin(request, origin);
  const template = (await (await request.get('/api/situations')).json())[0];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const title = `Reservation fixture ${suffix}`;
  const keys = new Set();
  const remove = async key => {
    const response = await request.get(`/api/admin/situations/${key}/permanent`);
    const preview = await response.json();
    expect(response.ok()).toBeTruthy();
    expect((await request.delete(`/api/admin/situations/${key}/permanent`, {
      headers: { ...headers, 'If-Match': String(preview.revision) }, data: { confirmation: preview.title },
    })).ok()).toBeTruthy();
    keys.delete(key);
  };
  const create = async (id, overrides = {}) => {
    const key = `reservation-${suffix}-${id}`;
    const response = await request.post('/api/situations', { headers,
      data: { ...template, key, title, audience: {}, variationNumber: 1, variationTagVersion: 2, variationTagged: false, variationSourceKey: undefined,
        outs: 0, runnersOn: { first: false, second: false, third: false }, hitType: 'line', ballLocation: 'LF',
        batterAdvance: 1, playOutcome: { result: 'single', batterResult: 'first', outsRecorded: 0, reviewStatus: 'ready' }, runnerOutcomes: [], ...overrides },
    });
    expect(response.status()).toBe(201);
    keys.add(key);
    return (await response.json()).record;
  };
  try {
    const original = await create('a');
    expect(original.variationNumber).toBe(1);
    expect(original.variationTagged).toBe(false);
    const simultaneous = await Promise.all([create('b'), create('c')]);
    expect(simultaneous.map(item => item.variationNumber).sort()).toEqual([2,3]);
    await remove(original.key);
    const replacement = await create('d');
    expect(replacement.variationNumber).toBe(4);
    const published = (await (await request.get('/api/situations')).json()).filter(item => keys.has(item.key));
    expect(published.every(item => item.variationTagged)).toBeTruthy();
    expect(published.map(item => item.variationNumber).sort()).toEqual([2,3,4]);
    for (const [id, conditions] of [
      ['outs', { outs: 1 }],
      ['runners', { runnersOn: { first: true, second: false, third: false }, runnerOutcomes: [{ startingBase: 'first', result: 'second', taggedUp: false }] }],
      ['type', { hitType: 'grounder' }],
      ['location', { ballLocation: 'CF' }],
      ['old-export', { outs: 2, variationNumber: 7, variationTagVersion: undefined, variationTagged: true }],
    ]) {
      const separate = await create(id, conditions);
      expect(separate.variationNumber).toBe(1);
      expect(separate.variationTagged).toBe(false);
    }
    const alternate = await create('alternate', { desc: 'Spoiler-free context', audience: { staffVariant: 'Staff only' } });
    expect(alternate.variationNumber).toBe(5);
    expect(alternate.variationTagged).toBe(true);
  } finally {
    for (const key of keys) await remove(key);
  }
});
