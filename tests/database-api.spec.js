import { test, expect, request as requestFactory } from '@playwright/test';

test.describe('portable SQLite API', () => {
  test('serves seeded situations and password-free roster options', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    expect(await health.json()).toEqual({ ok: true, database: 'sqlite' });

    const situations = await request.get('/api/situations');
    expect(situations.ok()).toBeTruthy();
    const situationRecords = await situations.json();
    expect(situationRecords.length).toBeGreaterThanOrEqual(22);
    expect(situationRecords[0]).toEqual(expect.objectContaining({
      displayCode: expect.stringMatching(/^S\d+(?:\.\d+)*$/),
      category: expect.any(String),
      difficulty: expect.stringMatching(/^(foundational|intermediate|advanced)$/),
      primaryCategory: expect.stringMatching(/^(cutoffs-relays|backups-rotations|force-plays|fly-ball-priority|rundowns|bunt-defense|first-third-defense|double-plays|base-coverage|pitcher-catcher-responsibilities|tag-ups-sacrifice-flies|situational-alignment)$/),
      relatedCategories: expect.any(Array),
    }));

    const teams = await request.get('/api/teams/options');
    expect(teams.ok()).toBeTruthy();
    const teamData = await teams.json();
    expect(teamData.teams.length).toBeGreaterThanOrEqual(2);
    expect(teamData.teams[0].roster[0]).not.toHaveProperty('password');
    expect(teamData.teams.find((team) => team.id === '13u-black')).toMatchObject({
      name: '13U Black',
      activeSeasonName: 'Spring 2027',
      displayName: '13U Black — Spring 2027',
    });
  });

  test('authenticates a player and persists a result', async ({ request, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const rejected = await request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: {
        role: 'player',
        teamId: '13u-black',
        playerId: '13u-black-bob-smith-11',
        password: 'wrong-password',
      },
    });
    expect(rejected.status()).toBe(401);

    const login = await request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: {
        role: 'player',
        teamId: '13u-black',
        playerId: '13u-black-bob-smith-11',
        password: 'password',
      },
    });
    expect(login.ok()).toBeTruthy();
    expect((await login.json()).user).toMatchObject({
      role: 'player',
      teamName: '13U Black — Spring 2027',
    });

    const runId = `database-test-${Date.now()}`;
    const completedAt = new Date().toISOString();
    const attempt = {
      formatVersion: 2,
      runId,
      outcome: 'passed',
      startedAt: completedAt,
      completedAt,
      situationKey: 'BD-01',
      phase: 2,
      phase1: {
        ok: true,
        scoreCorrect: 9,
        scoreTotal: 9,
        triesUsed: 1,
        elapsed: 8.5,
        completedAt,
      },
      sequenceStages: [{
        stage: 1,
        success: true,
        triesUsed: 0,
        timeElapsed: 4,
        picked: ['LF', 'SS', '2B'],
        expected: ['LF', 'SS', '2B'],
        completedAt,
      }],
      success: true,
      triesUsed: 0,
      timeElapsed: 4,
    };
    const save = await request.post('/api/attempts', {
      headers: { Origin: origin },
      data: attempt,
    });
    expect(save.status()).toBe(201);
    expect(await save.json()).toMatchObject({ created: true });

    const duplicate = await request.post('/api/attempts', {
      headers: { Origin: origin },
      data: attempt,
    });
    expect(duplicate.status()).toBe(200);
    expect(await duplicate.json()).toMatchObject({ created: false });

    const results = await request.get('/api/results/me');
    expect(results.ok()).toBeTruthy();
    const resultData = await results.json();
    const stored = resultData.log.find((entry) => entry.runId === runId);
    expect(stored).toMatchObject({
      runId,
      outcome: 'passed',
      teamName: '13U Black',
      playerName: 'Bob Smith',
      playerNumber: '11',
    });
    expect(stored.situationRevision).toBeGreaterThanOrEqual(1);
    expect(stored.sequenceStages).toHaveLength(1);
  });

  test('authenticates seeded player, coach, and admin accounts from D1', async ({ request, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const accounts = [
      {
        role: 'player',
        teamId: '13u-black',
        playerId: '13u-black-bob-smith-11',
        password: 'password',
      },
      {
        role: 'coach',
        teamId: '13u-black',
        coachId: 'staff-coach',
        password: 'password',
      },
      { role: 'admin', password: 'password' },
    ];

    for (const account of accounts) {
      const login = await request.post('/api/auth/login', {
        headers: { Origin: origin },
        data: account,
      });
      expect(login.ok()).toBeTruthy();
      expect((await login.json()).user.role).toBe(account.role);

      const session = await request.get('/api/auth/session');
      expect(session.ok()).toBeTruthy();
      expect((await session.json()).user.role).toBe(account.role);

      const logout = await request.post('/api/auth/logout', {
        headers: { Origin: origin },
      });
      expect(logout.ok()).toBeTruthy();
    }
  });

  test('marks assigned practice incomplete at start and completes it by finalizing the same attempt', async ({ request, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const coachLogin = await request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: {
        role: 'coach',
        teamId: '13u-black',
        coachId: 'staff-coach',
        password: 'password',
      },
    });
    expect(coachLogin.ok()).toBeTruthy();

    const created = await request.post('/api/practice/assignments', {
      headers: { Origin: origin },
      data: {
        title: `Infield practice ${Date.now()}`,
        instructions: 'Complete this situation.',
        dueAt: '2099-12-31',
        playerIds: ['13u-black-bob-smith-11'],
        situations: [{ situationKey: 'BD-01', requiredRepetitions: 9 }],
        publish: true,
      },
    });
    expect(created.status()).toBe(201);
    const assignment = (await created.json()).assignment;
    expect(assignment).toMatchObject({
      teamId: '13u-black',
      status: 'active',
      recipientCount: 1,
      situationCount: 1,
    });

    await request.post('/api/auth/logout', { headers: { Origin: origin } });
    const playerLogin = await request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: {
        role: 'player',
        teamId: '13u-black',
        playerId: '13u-black-bob-smith-11',
        password: 'password',
      },
    });
    expect(playerLogin.ok()).toBeTruthy();

    const queue = await request.get('/api/practice/assignments');
    expect(queue.ok()).toBeTruthy();
    const queueData = await queue.json();
    const queued = queueData.assignments.find((item) => item.id === assignment.id);
    expect(queued.recipients).toHaveLength(1);
    expect(queued.situations[0]).toMatchObject({
      situationKey: 'BD-01',
      requiredRepetitions: 1,
      completedRepetitions: 0,
      progressStatus: 'not_started',
    });
    expect(queued.situations[0].situationRevision).toBeGreaterThanOrEqual(1);
    expect(queued.situations[0].situation).toMatchObject({ key: 'BD-01' });
    expect(queued.situations[0].situation.revision).toBe(queued.situations[0].situationRevision);

    const startPractice = await request.post(`/api/practice/assignments/${assignment.id}/start`, {
      headers: { Origin: origin },
    });
    expect(startPractice.ok()).toBeTruthy();
    expect(await startPractice.json()).toMatchObject({
      pendingCount: 1,
      freePlayAllowed: false,
      lockedAssignmentId: assignment.id,
      nextSituation: { situationKey: 'BD-01' },
    });

    const invalidSituation = await request.post('/api/attempts', {
      headers: { Origin: origin },
      data: {
        runId: `practice-wrong-${Date.now()}`,
        assignmentId: assignment.id,
        situationKey: 'BD-02',
        phase: 1,
        outcome: 'passed',
        success: true,
        triesUsed: 1,
        timeElapsed: 5,
      },
    });
    expect(invalidSituation.status()).toBe(400);

    const runId = `practice-${assignment.id}`;
    const startedAt = new Date().toISOString();
    const started = await request.post('/api/attempts', {
      headers: { Origin: origin },
      data: {
        runId,
        assignmentId: assignment.id,
        situationKey: 'BD-01',
        situationRevision: queued.situations[0].situationRevision,
        phase: 1,
        startedAt,
      },
    });
    expect(started.status()).toBe(201);
    expect(await started.json()).toMatchObject({
      created: true,
      changed: true,
      lifecycleStatus: 'incomplete',
    });

    const duplicateStart = await request.post('/api/attempts', {
      headers: { Origin: origin },
      data: {
        runId,
        assignmentId: assignment.id,
        situationKey: 'BD-01',
        situationRevision: queued.situations[0].situationRevision,
        phase: 1,
        startedAt,
      },
    });
    expect(duplicateStart.status()).toBe(200);
    expect(await duplicateStart.json()).toMatchObject({ created: false, changed: false });

    const inProgressQueue = await request.get('/api/practice/assignments');
    const inProgress = (await inProgressQueue.json()).assignments.find((item) => item.id === assignment.id);
    expect(inProgress.recipients[0]).toMatchObject({ status: 'in_progress' });
    expect(inProgress.situations[0]).toMatchObject({
      completedRepetitions: 0,
      progressStatus: 'incomplete',
    });
    const resultsBeforeCompletion = await request.get('/api/results/me');
    expect((await resultsBeforeCompletion.json()).log.some((entry) => entry.runId === runId)).toBe(false);

    const completedAt = new Date().toISOString();
    const finalized = await request.post('/api/attempts', {
      headers: { Origin: origin },
      data: {
        runId,
        assignmentId: assignment.id,
        situationKey: 'BD-01',
        situationRevision: queued.situations[0].situationRevision,
        phase: 1,
        outcome: 'failed',
        success: false,
        triesUsed: 3,
        timeElapsed: 8,
        startedAt,
        completedAt,
      },
    });
    expect(finalized.status()).toBe(200);
    expect(await finalized.json()).toMatchObject({
      created: false,
      changed: true,
      lifecycleStatus: 'completed',
    });

    const duplicateFinal = await request.post('/api/attempts', {
      headers: { Origin: origin },
      data: {
        runId,
        assignmentId: assignment.id,
        situationKey: 'BD-01',
        situationRevision: queued.situations[0].situationRevision,
        phase: 1,
        outcome: 'failed',
        success: false,
        startedAt,
        completedAt,
      },
    });
    expect(duplicateFinal.status()).toBe(200);
    expect(await duplicateFinal.json()).toMatchObject({ created: false, changed: false });

    const completedQueue = await request.get('/api/practice/assignments');
    const completedData = await completedQueue.json();
    const completed = completedData.assignments.find((item) => item.id === assignment.id);
    expect(completed).toMatchObject({ status: 'completed' });
    expect(completed.recipients[0]).toMatchObject({ status: 'completed' });
    expect(completed.situations[0]).toMatchObject({
      completedRepetitions: 1,
      passedRepetitions: 0,
      progressStatus: 'completed',
    });
    const resultsAfterCompletion = await request.get('/api/results/me');
    expect((await resultsAfterCompletion.json()).log.filter((entry) => entry.runId === runId)).toHaveLength(1);
  });

  test('guides, advances interrupted attempts, orders, and releases player practice without API bypasses', async ({ baseURL }) => {
    const origin = new URL(baseURL).origin;
    const coach = await requestFactory.newContext({ baseURL });
    const player = await requestFactory.newContext({ baseURL });
    const playerId = '13u-black-bob-smith-11';
    const createAssignment = async (title, situations, dueAt = null) => {
      const response = await coach.post('/api/practice/assignments', {
        headers: { Origin: origin },
        data: { title, playerIds: [playerId], situations, dueAt, publish: true },
      });
      expect(response.status()).toBe(201);
      return (await response.json()).assignment;
    };
    try {
      expect((await coach.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { role: 'coach', teamId: '13u-black', coachId: 'staff-coach', password: 'password' },
      })).ok()).toBeTruthy();
      const first = await createAssignment(
        `Guided order ${Date.now()}`,
        [{ situationKey: 'BD-02' }, { situationKey: 'BD-03' }],
        '2020-01-01',
      );
      const second = await createAssignment(
        `Guided follow-up ${Date.now()}`,
        [{ situationKey: 'BD-04' }],
      );
      expect((await player.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { role: 'player', teamId: '13u-black', playerId, password: 'password' },
      })).ok()).toBeTruthy();

      const initialState = await player.get('/api/practice/status');
      expect(await initialState.json()).toMatchObject({
        pendingCount: 2,
        overdueCount: 1,
        freePlayAllowed: false,
        lockedAssignmentId: null,
      });
      const blockedFreePlay = await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: { runId: `blocked-free-${Date.now()}`, situationKey: 'BD-01', phase: 1 },
      });
      expect(blockedFreePlay.status()).toBe(400);

      const startedFirst = await player.post(`/api/practice/assignments/${first.id}/start`, {
        headers: { Origin: origin },
      });
      const startedState = await startedFirst.json();
      expect(startedState).toMatchObject({
        lockedAssignmentId: first.id,
        nextSituation: { situationKey: 'BD-02' },
      });
      expect((await player.post(`/api/practice/assignments/${second.id}/start`, {
        headers: { Origin: origin },
      })).status()).toBe(400);
      expect((await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: {
          runId: `out-of-order-${Date.now()}`,
          assignmentId: first.id,
          situationKey: 'BD-03',
          phase: 1,
        },
      })).status()).toBe(400);

      const firstRun = `guided-first-${Date.now()}`;
      const firstStartedAt = new Date().toISOString();
      const firstStart = await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: {
          runId: firstRun,
          assignmentId: first.id,
          situationKey: 'BD-02',
          situationRevision: startedState.nextSituation.situationRevision,
          phase: 1,
          startedAt: firstStartedAt,
        },
      });
      expect(firstStart.status()).toBe(201);
      expect((await firstStart.json()).practice.nextSituation).toMatchObject({
        situationKey: 'BD-02',
        progressStatus: 'incomplete',
      });

      const blockedSecondRun = await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: {
          runId: `second-run-${Date.now()}`,
          assignmentId: first.id,
          situationKey: 'BD-02',
          phase: 1,
        },
      });
      expect(blockedSecondRun.status()).toBe(400);

      const firstFinal = await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: {
          runId: firstRun,
          assignmentId: first.id,
          situationKey: 'BD-02',
          phase: 1,
          outcome: 'abandoned',
          abandonReason: 'page_closed',
          startedAt: firstStartedAt,
          completedAt: new Date().toISOString(),
        },
      });
      expect(await firstFinal.json()).toMatchObject({
        lifecycleStatus: 'abandoned',
        practiceProgressed: true,
        practice: {
          pendingCount: 2,
          freePlayAllowed: false,
          lockedAssignmentId: first.id,
          nextSituation: { situationKey: 'BD-03' },
        },
      });

      await player.post('/api/auth/logout', { headers: { Origin: origin } });
      await player.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { role: 'player', teamId: '13u-black', playerId, password: 'password' },
      });
      expect(await (await player.get('/api/practice/status')).json()).toMatchObject({
        lockedAssignmentId: first.id,
        nextSituation: { situationKey: 'BD-03', progressStatus: 'not_started' },
      });
      expect((await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: {
          runId: `repeat-completed-${Date.now()}`,
          assignmentId: first.id,
          situationKey: 'BD-02',
          phase: 1,
        },
      })).status()).toBe(400);

      const secondRun = `guided-second-${Date.now()}`;
      const secondStart = await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: { runId: secondRun, assignmentId: first.id, situationKey: 'BD-03', phase: 1 },
      });
      expect(secondStart.status()).toBe(201);
      const secondFinal = await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: {
          runId: secondRun,
          assignmentId: first.id,
          situationKey: 'BD-03',
          phase: 1,
          outcome: 'failed',
        },
      });
      expect(await secondFinal.json()).toMatchObject({
        practiceProgressed: true,
        practice: { pendingCount: 1, lockedAssignmentId: null, freePlayAllowed: false },
      });

      const secondAssignmentStart = await player.post(`/api/practice/assignments/${second.id}/start`, {
        headers: { Origin: origin },
      });
      expect(secondAssignmentStart.ok()).toBeTruthy();
      const interruptedRun = `coach-ended-${Date.now()}`;
      expect((await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: { runId: interruptedRun, assignmentId: second.id, situationKey: 'BD-04', phase: 1 },
      })).status()).toBe(201);
      expect((await coach.patch(`/api/practice/assignments/${second.id}`, {
        headers: { Origin: origin }, data: { action: 'close' },
      })).ok()).toBeTruthy();
      const endedFinal = await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: {
          runId: interruptedRun,
          assignmentId: second.id,
          situationKey: 'BD-04',
          phase: 1,
          outcome: 'passed',
        },
      });
      expect(await endedFinal.json()).toMatchObject({
        practiceProgressed: false,
        practice: { pendingCount: 0, freePlayAllowed: true, lockedAssignmentId: null },
      });

      const freeRun = `already-started-free-${Date.now()}`;
      expect((await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: { runId: freeRun, situationKey: 'BD-05', phase: 1 },
      })).status()).toBe(201);
      const addedDuringPlay = await createAssignment(
        `Added during free play ${Date.now()}`,
        [{ situationKey: 'BD-06' }],
      );
      const allowedFinal = await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: { runId: freeRun, situationKey: 'BD-05', phase: 1, outcome: 'passed' },
      });
      expect(allowedFinal.ok()).toBeTruthy();
      expect(await allowedFinal.json()).toMatchObject({
        practice: { pendingCount: 1, freePlayAllowed: false },
      });
      expect((await coach.patch(`/api/practice/assignments/${addedDuringPlay.id}`, {
        headers: { Origin: origin }, data: { action: 'cancel' },
      })).ok()).toBeTruthy();
      expect(await (await player.get('/api/practice/status')).json()).toMatchObject({
        pendingCount: 0,
        freePlayAllowed: true,
      });
    } finally {
      await coach.dispose();
      await player.dispose();
    }
  });

  test('supports the complete coach assignment lifecycle without losing history', async ({ baseURL }) => {
    const origin = new URL(baseURL).origin;
    const coach = await requestFactory.newContext({ baseURL });
    const player = await requestFactory.newContext({ baseURL });
    let assignmentId = '';
    try {
      expect((await coach.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { role: 'coach', teamId: '13u-black', coachId: 'staff-coach', password: 'password' },
      })).ok()).toBeTruthy();
      const created = await coach.post('/api/practice/assignments', {
        headers: { Origin: origin },
        data: {
          title: `Lifecycle draft ${Date.now()}`,
          playerIds: ['13u-black-kevin-smith-22'],
          situations: [{ situationKey: 'BD-01' }],
          publish: false,
        },
      });
      expect(created.status()).toBe(201);
      assignmentId = (await created.json()).assignment.id;

      const edited = await coach.put(`/api/practice/assignments/${assignmentId}`, {
        headers: { Origin: origin },
        data: {
          title: 'Lifecycle practice updated',
          instructions: 'Snapshot the roster and complete both plays.',
          dueAt: '2099-12-31',
          playerIds: ['13u-black-kevin-smith-22'],
          situations: [{ situationKey: 'BD-02' }, { situationKey: 'BD-03' }],
        },
      });
      expect(await edited.json()).toMatchObject({
        assignment: { title: 'Lifecycle practice updated', recipientCount: 1, situationCount: 2 },
      });
      const draftSearch = await coach.get('/api/practice/assignments?view=draft&search=lifecycle&sort=title');
      expect((await draftSearch.json()).assignments.some((item) => item.id === assignmentId)).toBe(true);

      expect((await coach.patch(`/api/practice/assignments/${assignmentId}`, {
        headers: { Origin: origin }, data: { action: 'publish' },
      })).ok()).toBeTruthy();
      const activeEdit = await coach.put(`/api/practice/assignments/${assignmentId}`, {
        headers: { Origin: origin },
        data: {
          title: 'Lifecycle practice active',
          instructions: 'Updated while active.',
          dueAt: null,
          addPlayerIds: ['13u-black-bob-smith-11'],
        },
      });
      expect(await activeEdit.json()).toMatchObject({
        assignment: { status: 'active', title: 'Lifecycle practice active', recipientCount: 2 },
      });

      const duplicated = await coach.patch(`/api/practice/assignments/${assignmentId}`, {
        headers: { Origin: origin }, data: { action: 'duplicate' },
      });
      const duplicate = (await duplicated.json()).assignment;
      expect(duplicate).toMatchObject({ status: 'draft', sourceAssignmentId: assignmentId, cycleNumber: 1 });
      expect((await coach.delete(`/api/practice/assignments/${duplicate.id}`, {
        headers: { Origin: origin },
      })).ok()).toBeTruthy();

      expect((await player.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { role: 'player', teamId: '13u-black', playerId: '13u-black-kevin-smith-22', password: 'password' },
      })).ok()).toBeTruthy();
      expect((await player.post(`/api/practice/assignments/${assignmentId}/start`, {
        headers: { Origin: origin },
      })).ok()).toBeTruthy();
      const runId = `cancelled-lifecycle-${Date.now()}`;
      expect((await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: { runId, assignmentId, situationKey: 'BD-02', phase: 1 },
      })).status()).toBe(201);

      expect((await coach.patch(`/api/practice/assignments/${assignmentId}`, {
        headers: { Origin: origin }, data: { action: 'cancel' },
      })).ok()).toBeTruthy();
      expect(await (await player.get('/api/practice/status')).json()).toMatchObject({ freePlayAllowed: true });
      const cancelledResult = (await (await player.get('/api/results/me')).json()).log
        .find((item) => item.runId === runId);
      expect(cancelledResult).toMatchObject({ outcome: 'abandoned', abandonReason: 'assignment_cancelled' });

      const retaken = await coach.patch(`/api/practice/assignments/${assignmentId}`, {
        headers: { Origin: origin }, data: { action: 'retake' },
      });
      const retake = (await retaken.json()).assignment;
      expect(retake).toMatchObject({ status: 'draft', sourceAssignmentId: assignmentId, cycleNumber: 2 });

      expect((await coach.patch(`/api/practice/assignments/${assignmentId}`, {
        headers: { Origin: origin }, data: { action: 'archive' },
      })).ok()).toBeTruthy();
      const archived = await coach.get('/api/practice/assignments?view=archived&search=lifecycle');
      expect((await archived.json()).assignments.some((item) => item.id === assignmentId)).toBe(true);
      const restored = await coach.patch(`/api/practice/assignments/${assignmentId}`, {
        headers: { Origin: origin }, data: { action: 'restore' },
      });
      expect(await restored.json()).toMatchObject({
        assignment: { status: 'active', cancelledAt: expect.any(String) },
      });

      await coach.delete(`/api/practice/assignments/${retake.id}`, { headers: { Origin: origin } });
    } finally {
      if (assignmentId) {
        await coach.patch(`/api/practice/assignments/${assignmentId}`, {
          headers: { Origin: origin }, data: { action: 'archive' },
        });
      }
      await coach.dispose();
      await player.dispose();
    }
  });

  test('limits team reports to staff roles', async ({ request, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const playerLogin = await request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: {
        role: 'player',
        teamId: '13u-black',
        playerId: '13u-black-bob-smith-11',
        password: 'password',
      },
    });
    expect(playerLogin.ok()).toBeTruthy();
    expect((await request.get('/api/reports/team/13u-black')).status()).toBe(403);
    expect((await request.get('/api/reports/team/13u-black/export')).status()).toBe(403);

    const coachLogin = await request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: {
        role: 'coach',
        teamId: '13u-black',
        coachId: 'staff-coach',
        password: 'password',
      },
    });
    expect(coachLogin.ok()).toBeTruthy();
    const report = await request.get('/api/reports/team/13u-black');
    expect(report.ok()).toBeTruthy();
    const activity = await report.json();
    expect(activity).toMatchObject({
      teamId: '13u-black',
      mode: 'activity',
      page: 1,
      pageSize: 5,
    });
    expect(activity.summary).toMatchObject({
      attempts: expect.any(Number),
      players: expect.any(Number),
      passed: expect.any(Number),
      failed: expect.any(Number),
      abandoned: expect.any(Number),
    });
    expect(new Set(activity.attempts.map((attempt) => attempt.playerId)).size)
      .toBe(activity.attempts.length);

    const playerReport = await request.get(
      '/api/reports/team/13u-black?playerId=13u-black-bob-smith-11&page=1',
    );
    expect(playerReport.ok()).toBeTruthy();
    const playerActivity = await playerReport.json();
    expect(playerActivity).toMatchObject({
      teamId: '13u-black',
      playerId: '13u-black-bob-smith-11',
      mode: 'player',
      pageSize: 3,
    });
    expect(playerActivity.attempts.length).toBeLessThanOrEqual(3);
    expect(playerActivity.attempts.every((attempt) =>
      attempt.playerId === '13u-black-bob-smith-11')).toBeTruthy();

    const passedReport = await request.get(
      '/api/reports/team/13u-black?outcome=passed&situationKey=BD-01',
    );
    expect(passedReport.ok()).toBeTruthy();
    const passedActivity = await passedReport.json();
    expect(passedActivity.filters).toMatchObject({ outcome: 'passed', situationKey: 'BD-01' });
    expect(passedActivity.attempts.every((attempt) =>
      attempt.outcome === 'passed' && attempt.situationKey === 'BD-01')).toBeTruthy();

    const invalidDates = await request.get(
      '/api/reports/team/13u-black?dateFrom=2026-09-01&dateTo=2026-08-01',
    );
    expect(invalidDates.status()).toBe(400);

    const exportResponse = await request.get(
      '/api/reports/team/13u-black/export?playerId=13u-black-bob-smith-11',
    );
    expect(exportResponse.ok()).toBeTruthy();
    expect(exportResponse.headers()['content-type']).toContain('text/csv');
    expect(exportResponse.headers()['content-disposition'])
      .toContain('diamond-defense-13u-black-results.csv');
    const csv = await exportResponse.text();
    expect(csv).toContain('"Date and Time","Player Number","Player","Situation","Result"');
    expect(csv).toContain('"Bob Smith"');

    expect((await request.get('/api/reports/team/12u-blue/export')).status()).toBe(403);
  });

  test('enforces temporary passwords, lockouts, password changes, and global sign-out', async ({ request, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const userId = `account-security-${Date.now()}`;
    const temporaryPassword = 'Temporary-4821';
    const permanentPassword = 'Permanent-5932';
    const resetPassword = 'Reset-Password-8047';
    const adminLogin = await request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { role: 'admin', password: 'password' },
    });
    expect(adminLogin.ok()).toBeTruthy();

    const created = await request.post('/api/admin/teams/13u-black/members', {
      headers: { Origin: origin },
      data: {
        userId,
        name: 'Account Security Test',
        number: '98',
        role: 'player',
        password: temporaryPassword,
      },
    });
    expect(created.status()).toBe(201);
    const createdRecord = (await created.json()).record;

    const player = await requestFactory.newContext({ baseURL });
    const secondDevice = await requestFactory.newContext({ baseURL });
    try {
      const temporaryLogin = await player.post('/api/auth/login', {
        headers: { Origin: origin },
        data: {
          role: 'player',
          teamId: '13u-black',
          playerId: userId,
          password: temporaryPassword,
        },
      });
      expect(temporaryLogin.ok()).toBeTruthy();
      expect((await temporaryLogin.json()).user.mustChangePassword).toBe(true);
      expect((await player.get('/api/results/me')).status()).toBe(403);

      const changed = await player.put('/api/auth/password', {
        headers: { Origin: origin },
        data: { currentPassword: temporaryPassword, newPassword: permanentPassword },
      });
      expect(changed.ok()).toBeTruthy();
      expect(await changed.json()).toMatchObject({
        ok: true,
        user: { mustChangePassword: false },
      });
      expect((await player.get('/api/results/me')).ok()).toBeTruthy();

      const secondLogin = await secondDevice.post('/api/auth/login', {
        headers: { Origin: origin },
        data: {
          role: 'player',
          teamId: '13u-black',
          playerId: userId,
          password: permanentPassword,
        },
      });
      expect(secondLogin.ok()).toBeTruthy();

      const logoutAll = await player.post('/api/auth/logout-all', {
        headers: { Origin: origin },
      });
      expect(logoutAll.ok()).toBeTruthy();
      expect((await player.get('/api/auth/session').then((response) => response.json())).user).toBeNull();
      expect((await secondDevice.get('/api/auth/session').then((response) => response.json())).user).toBeNull();

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const rejected = await player.post('/api/auth/login', {
          headers: { Origin: origin },
          data: {
            role: 'player',
            teamId: '13u-black',
            playerId: userId,
            password: 'Definitely-Wrong',
          },
        });
        expect(rejected.status()).toBe(attempt === 5 ? 429 : 401);
      }
      const lockedCorrectLogin = await player.post('/api/auth/login', {
        headers: { Origin: origin },
        data: {
          role: 'player',
          teamId: '13u-black',
          playerId: userId,
          password: permanentPassword,
        },
      });
      expect(lockedCorrectLogin.status()).toBe(429);

      const reset = await request.put(
        `/api/admin/teams/13u-black/members/${encodeURIComponent(userId)}/password`,
        {
          headers: { Origin: origin },
          data: { password: resetPassword },
        },
      );
      expect(reset.ok()).toBeTruthy();
      expect(await reset.json()).toMatchObject({ ok: true, mustChangePassword: true });

      const resetLogin = await player.post('/api/auth/login', {
        headers: { Origin: origin },
        data: {
          role: 'player',
          teamId: '13u-black',
          playerId: userId,
          password: resetPassword,
        },
      });
      expect(resetLogin.ok()).toBeTruthy();
      expect((await resetLogin.json()).user.mustChangePassword).toBe(true);
    } finally {
      await player.dispose();
      await secondDevice.dispose();
      const archived = await request.delete(
        `/api/admin/teams/13u-black/members/${encodeURIComponent(userId)}`,
        {
          headers: { Origin: origin, 'If-Match': String(createdRecord.revision) },
        },
      );
      expect(archived.ok()).toBeTruthy();
    }
  });

  test('manages seasons and the complete player data lifecycle without crossing season boundaries', async ({ baseURL }) => {
    const origin = new URL(baseURL).origin;
    const admin = await requestFactory.newContext({ baseURL });
    const player = await requestFactory.newContext({ baseURL });
    const suffix = String(Date.now());
    const teamId = `season-test-${suffix}`;
    const playerId = `season-player-${suffix}`;
    const temporaryPassword = 'Temporary-Season-4821';
    const permanentPassword = 'Permanent-Season-5932';
    try {
      expect((await admin.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { role: 'admin', password: 'password' },
      })).ok()).toBeTruthy();

      const teamResponse = await admin.post('/api/admin/teams', {
        headers: { Origin: origin },
        data: { id: teamId, name: 'Season Lifecycle Test' },
      });
      expect(teamResponse.status()).toBe(201);

      const initialSeasonsResponse = await admin.get(`/api/admin/teams/${teamId}/seasons`);
      const initialSeasonData = await initialSeasonsResponse.json();
      expect(initialSeasonData.seasons).toHaveLength(1);
      const firstSeason = initialSeasonData.seasons[0];
      expect(firstSeason).toMatchObject({ status: 'active', memberCount: 0 });

      const memberResponse = await admin.post(`/api/admin/teams/${teamId}/members`, {
        headers: { Origin: origin },
        data: {
          userId: playerId,
          name: 'Season Test Player',
          number: '27',
          role: 'player',
          password: temporaryPassword,
        },
      });
      expect(memberResponse.status()).toBe(201);
      const createdMember = (await memberResponse.json()).record;
      expect(createdMember.seasonId).toBe(firstSeason.id);

      expect((await player.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { role: 'player', teamId, playerId, password: temporaryPassword },
      })).ok()).toBeTruthy();
      expect((await player.put('/api/auth/password', {
        headers: { Origin: origin },
        data: { currentPassword: temporaryPassword, newPassword: permanentPassword },
      })).ok()).toBeTruthy();

      const firstRunId = `season-one-${suffix}`;
      expect((await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: {
          runId: firstRunId,
          situationKey: 'BD-01',
          phase: 1,
          outcome: 'passed',
          success: true,
          score: 9,
          total: 9,
        },
      })).status()).toBe(201);

      const removedResponse = await admin.delete(
        `/api/admin/teams/${teamId}/members/${playerId}`,
        { headers: { Origin: origin, 'If-Match': String(createdMember.revision) } },
      );
      expect(removedResponse.ok()).toBeTruthy();
      const removedMember = (await removedResponse.json()).record;
      expect(removedMember.active).toBe(false);
      expect((await player.get('/api/auth/session').then((response) => response.json())).user).toBeNull();

      const blockedAssignment = await admin.post('/api/practice/assignments', {
        headers: { Origin: origin },
        data: {
          teamId,
          title: 'Former player must not receive this',
          playerIds: [playerId],
          situations: [{ situationKey: 'BD-01' }],
          publish: true,
        },
      });
      expect(blockedAssignment.status()).toBe(400);

      const firstArchive = await admin.get(
        `/api/admin/teams/${teamId}/seasons/${firstSeason.id}/export`,
      );
      expect(firstArchive.ok()).toBeTruthy();
      expect(await firstArchive.text()).toContain(firstRunId);

      expect((await admin.patch(
        `/api/admin/teams/${teamId}/seasons/${firstSeason.id}`,
        { headers: { Origin: origin }, data: { action: 'close' } },
      )).ok()).toBeTruthy();
      const secondSeasonResponse = await admin.post(`/api/admin/teams/${teamId}/seasons`, {
        headers: { Origin: origin },
        data: { name: 'Season Lifecycle Test — Next Season', startsOn: '2099-01-01' },
      });
      expect(secondSeasonResponse.status()).toBe(201);
      const secondSeason = (await secondSeasonResponse.json()).season;

      const afterNewSeason = await admin.get(`/api/admin/teams/${teamId}/seasons`);
      const afterNewSeasonData = await afterNewSeason.json();
      expect(afterNewSeasonData.members.some((member) =>
        member.seasonId === secondSeason.id && member.userId === playerId)).toBe(false);

      const restoredResponse = await admin.post(
        `/api/admin/teams/${teamId}/members/${playerId}/restore`,
        { headers: { Origin: origin, 'If-Match': String(removedMember.revision) } },
      );
      expect(restoredResponse.ok()).toBeTruthy();
      expect((await restoredResponse.json()).record.seasonId).toBe(secondSeason.id);

      expect((await player.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { role: 'player', teamId, playerId, password: permanentPassword },
      })).ok()).toBeTruthy();
      const secondRunId = `season-two-${suffix}`;
      expect((await player.post('/api/attempts', {
        headers: { Origin: origin },
        data: {
          runId: secondRunId,
          situationKey: 'BD-02',
          phase: 1,
          outcome: 'failed',
          success: false,
        },
      })).status()).toBe(201);

      const cleanupPreview = await admin.get(
        `/api/admin/teams/${teamId}/seasons/${firstSeason.id}/cleanup?playerId=${playerId}`,
      );
      expect(await cleanupPreview.json()).toMatchObject({
        preview: { seasonId: firstSeason.id, playerId, memberships: 1, attempts: 1 },
      });
      expect((await admin.post(
        `/api/admin/teams/${teamId}/seasons/${firstSeason.id}/cleanup`,
        {
          headers: { Origin: origin },
          data: { playerId, confirmation: 'CLEAR SEASON RECORDS' },
        },
      )).ok()).toBeTruthy();

      const secondArchive = await admin.get(
        `/api/admin/teams/${teamId}/seasons/${secondSeason.id}/export`,
      );
      expect(secondArchive.ok()).toBeTruthy();
      expect(await secondArchive.text()).toContain(secondRunId);
      expect((await player.get('/api/auth/session').then((response) => response.json())).user)
        .toMatchObject({ id: playerId });

      expect((await admin.delete(`/api/admin/users/${playerId}`, {
        headers: { Origin: origin },
        data: { confirmation: 'DELETE PLAYER PERMANENTLY' },
      })).ok()).toBeTruthy();
      expect((await player.get('/api/auth/session').then((response) => response.json())).user).toBeNull();
      expect((await player.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { role: 'player', teamId, playerId, password: permanentPassword },
      })).status()).toBe(401);
      const afterDeletion = await admin.get(`/api/admin/teams/${teamId}/seasons`);
      expect((await afterDeletion.json()).members.some((member) => member.userId === playerId)).toBe(false);
    } finally {
      await admin.dispose();
      await player.dispose();
    }
  });

  test('moves stable player accounts between teams and advances a closed-season roster', async ({ baseURL }) => {
    const origin = new URL(baseURL).origin;
    const admin = await requestFactory.newContext({ baseURL });
    const player = await requestFactory.newContext({ baseURL });
    const suffix = String(Date.now());
    const password = 'Transfer-Test-4821';
    try {
      expect((await admin.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { role: 'admin', password: 'password' },
      })).ok()).toBeTruthy();

      const sourceResponse = await admin.post('/api/admin/teams', {
        headers: { Origin: origin },
        data: { name: `13U Repeatable ${suffix}` },
      });
      expect(sourceResponse.status()).toBe(201);
      const source = (await sourceResponse.json()).record;
      expect(source.id).toMatch(/^team-[0-9a-f-]+$/);
      expect(source.displayName).toContain('13U Repeatable');

      const duplicateTeamResponse = await admin.post('/api/admin/teams', {
        headers: { Origin: origin },
        data: { name: `13U Repeatable ${suffix}`, seasonName: 'Fall 2027' },
      });
      expect(duplicateTeamResponse.status()).toBe(400);

      const destinationResponse = await admin.post('/api/admin/teams', {
        headers: { Origin: origin },
        data: { name: `14U Destination ${suffix}`, seasonName: 'Spring 2027' },
      });
      expect(destinationResponse.status()).toBe(201);
      const destination = (await destinationResponse.json()).record;
      expect(destination.id).not.toBe(source.id);

      const firstPlayerResponse = await admin.post(`/api/admin/teams/${source.id}/members`, {
        headers: { Origin: origin },
        data: { name: 'Stable Transfer Player', number: '7', role: 'player', password },
      });
      expect(firstPlayerResponse.status()).toBe(201);
      const firstPlayer = (await firstPlayerResponse.json()).record;
      expect(firstPlayer.playerId).toMatch(/^player-[0-9a-f-]+$/);

      const duplicateNumber = await admin.post(`/api/admin/teams/${source.id}/members`, {
        headers: { Origin: origin },
        data: { name: 'Duplicate Number', number: '7', role: 'player', password },
      });
      expect(duplicateNumber.status()).toBe(400);

      const secondPlayerResponse = await admin.post(`/api/admin/teams/${source.id}/members`, {
        headers: { Origin: origin },
        data: { name: 'Roster Advance Player', number: '12', role: 'player', password },
      });
      expect(secondPlayerResponse.status()).toBe(201);
      const secondPlayer = (await secondPlayerResponse.json()).record;

      const transferResponse = await admin.post(
        `/api/admin/players/${firstPlayer.playerId}/transfer`,
        {
          headers: { Origin: origin },
          data: { destinationTeamId: destination.id, number: '9' },
        },
      );
      expect(transferResponse.ok()).toBeTruthy();
      const transferred = (await transferResponse.json()).record;
      expect(transferred).toMatchObject({
        playerId: firstPlayer.playerId,
        number: '9',
        active: true,
      });

      expect((await player.post('/api/auth/login', {
        headers: { Origin: origin },
        data: {
          role: 'player',
          teamId: source.id,
          playerId: firstPlayer.playerId,
          password,
        },
      })).status()).toBe(401);
      expect((await player.post('/api/auth/login', {
        headers: { Origin: origin },
        data: {
          role: 'player',
          teamId: destination.id,
          playerId: firstPlayer.playerId,
          password,
        },
      })).ok()).toBeTruthy();

      const removedResponse = await admin.delete(
        `/api/admin/teams/${destination.id}/members/${firstPlayer.playerId}`,
        { headers: { Origin: origin, 'If-Match': String(transferred.revision) } },
      );
      expect(removedResponse.ok()).toBeTruthy();
      const unassigned = await admin.get('/api/admin/players/unassigned');
      expect((await unassigned.json()).players).toEqual(expect.arrayContaining([
        expect.objectContaining({ userId: firstPlayer.playerId }),
      ]));

      const readdedResponse = await admin.post(
        `/api/admin/teams/${destination.id}/members/existing`,
        {
          headers: { Origin: origin },
          data: { userId: firstPlayer.playerId, number: '19' },
        },
      );
      expect(readdedResponse.status()).toBe(201);
      expect((await readdedResponse.json()).record).toMatchObject({
        playerId: firstPlayer.playerId,
        number: '19',
        active: true,
      });
      expect((await player.post('/api/auth/login', {
        headers: { Origin: origin },
        data: {
          role: 'player',
          teamId: destination.id,
          playerId: firstPlayer.playerId,
          password,
        },
      })).ok()).toBeTruthy();

      const sourceSeasons = await admin.get(`/api/admin/teams/${source.id}/seasons`);
      const activeSourceSeason = (await sourceSeasons.json()).seasons.find(
        (season) => season.status === 'active',
      );
      expect(activeSourceSeason).toBeTruthy();
      expect((await admin.patch(
        `/api/admin/teams/${source.id}/seasons/${activeSourceSeason.id}`,
        { headers: { Origin: origin }, data: { action: 'close' } },
      )).ok()).toBeTruthy();

      const advanceResponse = await admin.post(`/api/admin/teams/${source.id}/advance`, {
        headers: { Origin: origin },
        data: {
          destinationTeamName: `14U Advanced ${suffix}`,
          seasonName: 'Spring 2027',
          startsOn: '2027-03-01',
          members: [{ userId: secondPlayer.playerId, number: '22' }],
        },
      });
      expect(advanceResponse.status()).toBe(201);
      const advanced = await advanceResponse.json();
      expect(advanced.team).toMatchObject({ name: `14U Advanced ${suffix}` });
      expect(advanced.movedUserIds).toEqual([secondPlayer.playerId]);
      expect(advanced.team.roster).toEqual(expect.arrayContaining([
        expect.objectContaining({
          playerId: secondPlayer.playerId,
          number: '22',
          seasonId: advanced.seasonId,
          active: true,
        }),
      ]));

      const blockedDuplicateMembership = await admin.post(
        `/api/admin/teams/${destination.id}/members/existing`,
        {
          headers: { Origin: origin },
          data: { userId: secondPlayer.playerId, number: '23' },
        },
      );
      expect(blockedDuplicateMembership.status()).toBe(400);
    } finally {
      await admin.dispose();
      await player.dispose();
    }
  });

  test('imports new teams and accounts into an active season with stable login IDs', async ({ baseURL }) => {
    const origin = new URL(baseURL).origin;
    const admin = await requestFactory.newContext({ baseURL });
    const player = await requestFactory.newContext({ baseURL });
    const suffix = String(Date.now());
    const teamId = `csv-season-${suffix}`;
    const playerId = `csv-player-${suffix}`;
    const password = 'CSV-Temporary-4821';
    const csv = [
      'record_type,action,team_id,team_name,season_name,user_id,role,name,number,password',
      `team,upsert,${teamId},Reusable Team Name,Spring 2027,,,,,`,
      `member,upsert,${teamId},,,${playerId},player,CSV Player,31,${password}`,
    ].join('\n');
    try {
      expect((await admin.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { role: 'admin', password: 'password' },
      })).ok()).toBeTruthy();
      const previewResponse = await admin.post('/api/admin/team-import', {
        headers: { Origin: origin },
        data: { mode: 'preview', csv },
      });
      expect(previewResponse.ok()).toBeTruthy();
      const preview = await previewResponse.json();
      expect(preview).toMatchObject({
        valid: true,
        summary: { changes: 2, creates: 2, errors: 0 },
      });
      const commit = await admin.post('/api/admin/team-import', {
        headers: { Origin: origin },
        data: { mode: 'commit', csv, fingerprint: preview.fingerprint },
      });
      expect(commit.ok()).toBeTruthy();

      const teams = await admin.get('/api/admin/teams?includeArchived=true');
      const imported = (await teams.json()).teams.find((team) => team.id === teamId);
      expect(imported).toMatchObject({
        name: 'Reusable Team Name',
        displayName: 'Reusable Team Name — Spring 2027',
        active: true,
      });
      expect(imported.roster).toEqual(expect.arrayContaining([
        expect.objectContaining({
          playerId,
          number: '31',
          active: true,
          seasonId: expect.any(String),
        }),
      ]));
      expect((await player.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { role: 'player', teamId, playerId, password },
      })).ok()).toBeTruthy();
    } finally {
      await admin.dispose();
      await player.dispose();
    }
  });

  test('deletes closed seasons and teams only after explicit destructive confirmation', async ({ baseURL }) => {
    const origin = new URL(baseURL).origin;
    const admin = await requestFactory.newContext({ baseURL });
    const player = await requestFactory.newContext({ baseURL });
    const suffix = String(Date.now());
    const password = 'Permanent-Test-4821';
    try {
      expect((await admin.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { role: 'admin', password: 'password' },
      })).ok()).toBeTruthy();

      const createTeam = async (name) => {
        const response = await admin.post('/api/admin/teams', {
          headers: { Origin: origin },
          data: { name, seasonName: 'Spring 2027' },
        });
        expect(response.status()).toBe(201);
        return (await response.json()).record;
      };
      const closeActiveSeason = async (teamId) => {
        const data = await (await admin.get(`/api/admin/teams/${teamId}/seasons`)).json();
        const season = data.seasons.find((item) => item.status === 'active');
        expect(season).toBeTruthy();
        expect((await admin.patch(`/api/admin/teams/${teamId}/seasons/${season.id}`, {
          headers: { Origin: origin },
          data: { action: 'close' },
        })).ok()).toBeTruthy();
        return season;
      };

      const seasonTeam = await createTeam(`Season Delete ${suffix}`);
      const closedSeason = await closeActiveSeason(seasonTeam.id);
      expect((await admin.delete(
        `/api/admin/teams/${seasonTeam.id}/seasons/${closedSeason.id}`,
        { headers: { Origin: origin }, data: { confirmation: 'wrong' } },
      )).status()).toBe(400);
      expect((await admin.delete(
        `/api/admin/teams/${seasonTeam.id}/seasons/${closedSeason.id}`,
        { headers: { Origin: origin }, data: { confirmation: closedSeason.name } },
      )).ok()).toBeTruthy();
      expect((await (await admin.get(`/api/admin/teams/${seasonTeam.id}/seasons`)).json()).seasons)
        .toHaveLength(0);

      const retainedTeam = await createTeam(`Retain Players ${suffix}`);
      const retainedPlayerResponse = await admin.post(`/api/admin/teams/${retainedTeam.id}/members`, {
        headers: { Origin: origin },
        data: { name: 'Retained Player', number: '5', role: 'player', password },
      });
      const retainedPlayer = (await retainedPlayerResponse.json()).record;
      await closeActiveSeason(retainedTeam.id);
      expect((await admin.delete(`/api/admin/teams/${retainedTeam.id}/permanent`, {
        headers: { Origin: origin },
        data: { confirmation: 'wrong', deletePlayers: false },
      })).status()).toBe(400);
      expect((await admin.delete(`/api/admin/teams/${retainedTeam.id}/permanent`, {
        headers: { Origin: origin },
        data: { confirmation: retainedTeam.name, deletePlayers: false },
      })).ok()).toBeTruthy();
      const unassigned = (await (await admin.get('/api/admin/players/unassigned')).json()).players;
      expect(unassigned).toEqual(expect.arrayContaining([
        expect.objectContaining({ userId: retainedPlayer.playerId }),
      ]));

      const deletedTeam = await createTeam(`Delete Players ${suffix}`);
      const deletedPlayerResponse = await admin.post(`/api/admin/teams/${deletedTeam.id}/members`, {
        headers: { Origin: origin },
        data: { name: 'Deleted Player', number: '6', role: 'player', password },
      });
      const deletedPlayer = (await deletedPlayerResponse.json()).record;
      await closeActiveSeason(deletedTeam.id);
      const preview = await admin.get(`/api/admin/teams/${deletedTeam.id}/deletion-preview`);
      expect(await preview.json()).toMatchObject({ preview: { players: 1, seasons: 1 } });
      expect((await admin.delete(`/api/admin/teams/${deletedTeam.id}/permanent`, {
        headers: { Origin: origin },
        data: { confirmation: deletedTeam.name, deletePlayers: true },
      })).ok()).toBeTruthy();
      expect((await player.post('/api/auth/login', {
        headers: { Origin: origin },
        data: {
          role: 'player', teamId: deletedTeam.id,
          playerId: deletedPlayer.playerId, password,
        },
      })).status()).toBe(401);
      const afterDeletion = (await (await admin.get('/api/admin/players/unassigned')).json()).players;
      expect(afterDeletion.some((item) => item.userId === deletedPlayer.playerId)).toBe(false);
    } finally {
      await admin.dispose();
      await player.dispose();
    }
  });
});
