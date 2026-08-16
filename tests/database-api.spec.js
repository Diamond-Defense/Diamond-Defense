import { test, expect } from '@playwright/test';

test.describe('portable SQLite API', () => {
  test('serves seeded situations and password-free roster options', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    expect(await health.json()).toEqual({ ok: true, database: 'sqlite' });

    const situations = await request.get('/api/situations');
    expect(situations.ok()).toBeTruthy();
    expect(await situations.json()).toHaveLength(22);

    const teams = await request.get('/api/teams/options');
    expect(teams.ok()).toBeTruthy();
    const teamData = await teams.json();
    expect(teamData.teams).toHaveLength(2);
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

    const marker = `database-test-${Date.now()}`;
    const save = await request.post('/api/attempts', {
      headers: { Origin: origin },
      data: {
        situationKey: 'BD-01',
        situationTitle: marker,
        phase: 1,
        score: 9,
        total: 9,
        triesUsed: 1,
        timeElapsed: 8.5,
      },
    });
    expect(save.status()).toBe(201);

    const results = await request.get('/api/results/me');
    expect(results.ok()).toBeTruthy();
    expect((await results.json()).log).toEqual(
      expect.arrayContaining([expect.objectContaining({ situationTitle: marker })]),
    );
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

    const coachLogin = await request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { role: 'coach', password: 'coach' },
    });
    expect(coachLogin.ok()).toBeTruthy();
    const report = await request.get('/api/reports/team/13u-black');
    expect(report.ok()).toBeTruthy();
    expect((await report.json()).teamId).toBe('13u-black');
  });
});
