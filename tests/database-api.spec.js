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
      category: expect.any(String),
      difficulty: expect.stringMatching(/^(beginner|intermediate|advanced)$/),
    }));

    const teams = await request.get('/api/teams/options');
    expect(teams.ok()).toBeTruthy();
    const teamData = await teams.json();
    expect(teamData.teams.length).toBeGreaterThanOrEqual(2);
    expect(teamData.teams[0].roster[0]).not.toHaveProperty('password');
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
        password: '1234',
      },
    });
    expect(login.ok()).toBeTruthy();
    expect((await login.json()).user.role).toBe('player');

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
        password: '1234',
      },
      {
        role: 'coach',
        teamId: '13u-black',
        coachId: 'staff-coach',
        password: 'coach',
      },
      { role: 'admin', password: 'admin' },
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

  test('limits team reports to staff roles', async ({ request, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const playerLogin = await request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: {
        role: 'player',
        teamId: '13u-black',
        playerId: '13u-black-bob-smith-11',
        password: '1234',
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
        password: 'coach',
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
      data: { role: 'admin', password: 'admin' },
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
});
