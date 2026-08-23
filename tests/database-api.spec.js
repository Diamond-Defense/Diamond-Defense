import { test, expect } from '@playwright/test';

test.describe('portable SQLite API', () => {
  test('serves seeded situations and password-free roster options', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    expect(await health.json()).toEqual({ ok: true, database: 'sqlite' });

    const situations = await request.get('/api/situations');
    expect(situations.ok()).toBeTruthy();
    expect((await situations.json()).length).toBeGreaterThanOrEqual(22);

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
});
