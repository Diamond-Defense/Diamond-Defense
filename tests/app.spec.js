import {openBattedBall, openLibraryPlay, selectStage } from './helpers/play-library.js';
import { test, expect, request as requestFactory } from '@playwright/test';

// Color assertions follow the shared theme; behavioral assertions remain unchanged.
async function semanticColor(page, token) {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

// Publish isolated copies so uniqueness rules and failures cannot change the
// shared gameplay fixtures used by the rest of the regression suite.
const publishingTest = test.extend({
  isolatePublishedSituation: [async ({ page, baseURL }, use) => {
    const keys = [];
    await use(async (record) => {
      const key = `publishing-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const response = await page.request.post('/api/situations', {
        headers: { Origin: new URL(baseURL).origin },
        data: { ...record, key, title: `Publishing fixture ${key}` },
      });
      expect(response.ok()).toBeTruthy();
      const created = (await response.json()).record;
      keys.push(key);
      Object.assign(record, created);
      await page.evaluate(async (key) => { await loadSituationsFromDatabase(); setSituation(key); }, key);
    });
    for (const key of keys) {
      const records = await (await page.request.get('/api/situations')).json();
      const current = records.find(record => record.key === key);
      if (!current) continue;
      const archived = await page.request.delete(`/api/situations/${encodeURIComponent(key)}`, {
        headers: { Origin: new URL(baseURL).origin, 'If-Match': String(current.revision) },
      });
      expect(archived.ok(), `Archive isolated situation ${key}`).toBeTruthy();
    }
  }, { timeout: 30_000 }],
});

async function openCleanApp(page) {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
  await page.evaluate(() => window.__DIQ_READY__);
  await expect(page.locator('#fieldImg')).toBeVisible();
  await page.locator('#fieldImg').evaluate(image => image.decode());
  return pageErrors;
}

async function loginAsSeedPlayer(page) {
  await page.locator('#playerBtn').click();
  await page.locator('#playerTeamSelect').selectOption('13u-black');
  await page.locator('#playerNameSelect').selectOption('13u-black-bob-smith-11');
  await page.locator('#playerPass').fill('password');
  await page.locator('#playerLoginBtn').click();
  await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('#11 Bob Smith');
}

async function logoutCurrentUser(page) {
  await page.evaluate(() => { window.__logoutWorkspaceMarker = true; });
  await page.locator('#playerBtn').click();
  await expect(page.locator('#accountMenu')).toBeVisible();
  await Promise.all([page.waitForEvent('load'), page.locator('#accountLogoutBtn').click()]);
  await page.evaluate(() => window.__DIQ_READY__);
  await expect(page.locator('#playerModalOverlay')).toBeVisible();
  await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('Login');
  // Most callers explicitly open their next login; close this verified landing dialog.
  await expect.poll(() => page.evaluate(() => window.__logoutWorkspaceMarker)).toBeUndefined();
  await expect.poll(() => page.evaluate(() => window.__DIQ_AUTH_USER__)).toBeNull();
  await expect(page.locator('#staffToolsBtn')).toBeHidden();
  await page.locator('#playerModalCloseX').click();
}

test.describe('Diamond Defence regression behavior', () => {
  test('admin team training closes completely when returning to admin tools or field', async ({ page }) => {
    const errors = await openCleanApp(page);
    await page.locator('#playerBtn').click();
    await page.locator('#authAdminTab').click();
    await page.locator('#adminPwInput').fill('password');
    await page.locator('#adminPwOk').click();
    await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('Administrator');
    await page.locator('#staffToolsBtn').click();
    for (const exit of ['local', 'header']) {
      await page.locator('#adminCard').getByRole('button', { name: 'Team training', exact: true }).click();
      await expect(page.locator('#coachCard .tools-panel-header strong')).toHaveText('Team training');
      await expect(page.locator('#coachResultsWorkspace')).toBeVisible();
      await expect(page.locator('[data-coach-tab="proposals"]')).toBeHidden();
      await page.locator(exit === 'local' ? '#coachCardCloseBtn' : '#staffToolsBtn').click();
      for (const section of ['Teams & accounts', 'Situations', 'Recovery']) {
        await page.locator('#adminCard').getByRole('button', { name: section, exact: true }).click();
        await expect(page.locator('#coachResultsWorkspace')).toBeHidden();
        await expect(page.locator('#practiceWorkspace')).toBeHidden();
        await expect(page.locator('#coachCard')).toBeHidden();
        await expect(page.locator('.field-card')).toBeHidden();
        if(section==='Recovery')await expect(page.locator('[data-admin-view="recovery"]')).toBeVisible();
      }
      await page.locator('#adminCardCloseBtn').click();
      await expect(page.locator('.field-card')).toBeVisible();
      await expect(page.locator('#coachResultsWorkspace')).toBeHidden();
      await page.locator('#staffToolsBtn').click();
    }
    expect(errors).toEqual([]);
  });

  test('an empty published library still allows admin sign-in and import', async ({ page }) => {
    await page.route('**/api/situations', route => route.fulfill({ json: [] }));
    const errors = await openCleanApp(page);
    await expect(page.locator('#descHud')).toHaveText('No published situations');
    await page.locator('#playerBtn').click();
    await page.locator('#authAdminTab').click();
    await page.locator('#adminPwInput').fill('password');
    await page.locator('#adminPwOk').click();
    await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('Administrator');
    // Empty-library presentation hides Start; still verify gameplay is disabled.
    await expect(page.locator('#startBtn')).toBeDisabled();
    await expect(page.getByRole('button', { name: /Random/ })).toBeDisabled();
    await page.locator('#staffToolsBtn').click();
    await page.getByRole('button', { name: 'Situations', exact: true }).click();
    const library = page.locator('#situationLibrary');
    await expect(library).toBeVisible();
    await library.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(library.getByLabel('Situation export file')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('admin bulk situation deletion selects search results without deleting on selection', async ({ page }) => {
    await openCleanApp(page);
    await page.locator('#playerBtn').click();
    await page.locator('#authAdminTab').click();
    await page.locator('#adminPwInput').fill('password');
    await page.locator('#adminPwOk').click();
    await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('Administrator');
    await page.locator('#staffToolsBtn').click();
    await page.getByRole('button', { name: 'Situations', exact: true }).click();
    const library = page.locator('#situationLibrary');
    await library.getByRole('button', { name: 'Delete situations', exact: true }).click();
    const search = library.getByRole('searchbox', { name: 'Search situations' });
    await search.fill('LF');
    const matches = await library.locator('.situation-library-row input').count();
    expect(matches).toBeGreaterThan(0);
    await library.getByRole('button', { name: 'Select matching situations', exact: true }).click();
    await expect(library.locator('.situation-library-row input:checked')).toHaveCount(matches);
    await search.fill('no-situation-matches-this');
    await expect(library.getByRole('button', { name: `Delete selected (${matches})`, exact: true })).toBeEnabled();
    await library.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await expect(library.getByRole('button', { name: 'Delete selected', exact: true })).toBeDisabled();
    await search.fill('');
    await expect(library.locator('.situation-library-row input:checked')).toHaveCount(0);
  });

  test('ignores legacy browser data and loads authoritative D1 records', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('diq_teams_v1', JSON.stringify({
        teams: [{ id: 'browser-only', name: 'Browser Only', roster: [] }],
      }));
      localStorage.setItem('bb_iq_starts_v12', JSON.stringify({
        'BD-01': { P: { x: 1, y: 1 } },
      }));
      localStorage.setItem('bb_iq_hits_v12', JSON.stringify({
        'BD-01': { x: 1, y: 1 },
      }));
      localStorage.setItem('diq_results_v1_browser-only', JSON.stringify({
        log: [{ situationKey: 'BROWSER-ONLY' }],
      }));
    });

    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
    await page.evaluate(() => window.__DIQ_READY__);

    await expect
      .poll(() => page.evaluate(async () => (await fetch('/api/situations')).json().then((records) => records.length)))
      .toBeGreaterThanOrEqual(22);
    expect(await page.locator('#playerTeamSelect option').allTextContents()).not.toContain('Browser Only');
    const pitcherStart = await page.evaluate(() => getStartFor('BD-01', 'P'));
    expect(pitcherStart).not.toEqual({ x: 1, y: 1 });
  });

  test('shows a blocking state when the database API is unavailable', async ({ page }) => {
    await page.route('**/api/situations', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Test database outage' }),
      });
    });

    await page.goto('/');
    await page.evaluate(() => window.__DIQ_READY__);

    await expect(page.getByRole('alert')).toContainText('Database unavailable');
    await expect(page.getByRole('alert')).toContainText('Test database outage');
    await expect(page.locator('html')).toHaveAttribute('data-diq-database', 'unavailable');
  });

  test('boots without JavaScript errors and renders the complete game', async ({ page }) => {
    const pageErrors = await openCleanApp(page);

    const field = page.locator('#fieldImg');
    await expect(field).toHaveAttribute('alt', 'Diamond Defence baseball strategy field');
    await expect(field).toHaveJSProperty('naturalWidth', 1536);
    await expect(field).toHaveJSProperty('naturalHeight', 1024);
    expect(await field.evaluate((image) => new URL(image.src).pathname)).toContain(
      'diamond-defense-soft-field',
    );
    await expect(field).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    expect(await page.evaluate(async () => (await fetch('/api/situations')).json().then((records) => records.length))).toBeGreaterThanOrEqual(22);
    await expect(page.locator('#wrap .chip')).toHaveCount(9);
    await expect(page.locator('#wrap .tgt')).toHaveCount(9);
    const appIcon = page.locator('.brand-mark img');
    await expect(appIcon).toBeVisible();
    await expect.poll(() => appIcon.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    const logo = await appIcon.evaluate(image => ({
      src: image.src,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      width: image.getBoundingClientRect().width,
      height: image.getBoundingClientRect().height,
    }));
    expect(logo.src).toContain('diamond-defence-classic');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /diamond-defence-classic-favicon/);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('sizes', '180x180');
    expect(logo.naturalWidth).toBe(logo.naturalHeight);
    expect(logo.width).toBeGreaterThanOrEqual(44);
    expect(logo.width).toBeLessThanOrEqual(48);
    expect(logo.height).toBe(logo.width);
    await expect(page.locator('.auth-brand-mark img')).toHaveJSProperty('src', logo.src);
    await expect(page.locator('.screen-size-gate-mark img')).toHaveJSProperty('src', logo.src);
    const groupColors = await page.evaluate(() => ({
      pitcher: getComputedStyle(tokens.get('P').el).backgroundColor,
      catcher: getComputedStyle(tokens.get('C').el).backgroundColor,
      infield: getComputedStyle(tokens.get('1B').el).backgroundColor,
      outfield: getComputedStyle(tokens.get('CF').el).backgroundColor,
      outfieldText: getComputedStyle(tokens.get('CF').el).color,
      chipBorder: getComputedStyle(tokens.get('CF').el).borderColor,
      chipBoxSizing: getComputedStyle(tokens.get('CF').el).boxSizing,
      pitcherOpacity: getComputedStyle(tokens.get('P').el).opacity,
      outfieldOpacity: getComputedStyle(tokens.get('CF').el).opacity,
    }));
    const defenderColor = await semanticColor(page, '--defender');
    expect(groupColors).toEqual({
      pitcher: defenderColor,
      catcher: defenderColor,
      infield: defenderColor,
      outfield: defenderColor,
      outfieldText: await semanticColor(page, '--baseball-line'),
      chipBorder: await semanticColor(page, '--defender-highlight'),
      chipBoxSizing: 'border-box',
      pitcherOpacity: '1',
      outfieldOpacity: '1',
    });
    await expect(page.locator('#scoreVal')).toHaveText('0');
    await expect(page.locator('#triesVal')).toHaveText('3/3');
    expect(pageErrors).toEqual([]);
  });

  test('changing situations updates the situation HUD', async ({ page }) => {
    await openCleanApp(page);
    await loginAsSeedPlayer(page);

    const values = await page.evaluate(async () => (await fetch('/api/situations')).json().then((records) => records.map((situation) => situation.key)));
    expect(values).toContain('BD-01');
    expect(values).toContain('BD-20');

    await page.getByRole('button', { name: 'Playbook', exact: true }).click();
    await page.locator('.playbook-situation-card[data-situation-key="BD-02"]').click();
    await expect.poll(() => page.evaluate(() => currentSituation?.key)).toBe('BD-02');
    await expect(page.locator('#descHud')).not.toHaveText('');
    await expect(page.locator('#outsVal')).toHaveText(/^[0-2]$/);
    const situationHud = await page.evaluate(() => ({
      outs: currentSituation.outs,
      markedOuts: document.querySelectorAll('.training-out-map .is-recorded').length,
      runners: Object.entries(currentSituation.runnersOn || {}).filter(([, occupied]) => occupied).map(([base]) => base).sort(),
      markedRunners: [...document.querySelectorAll('.training-base-map .is-occupied')].map(marker => marker.dataset.marker).sort(),
    }));
    expect(situationHud.markedOuts).toBe(situationHud.outs);
    expect(situationHud.markedRunners).toEqual(situationHud.runners);

    await page.locator('#randomSitBtn').click();
    await expect.poll(() => page.evaluate(() => currentSituation?.key)).not.toBe('BD-02');
  });

  test('Playbook browser filters database situations and selects one for practice', async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await openCleanApp(page);
    await loginAsSeedPlayer(page);

    await page.getByRole('button', { name: 'Playbook', exact: true }).click();
    const browser = page.getByRole('dialog', { name: 'Playbook' });
    await expect(browser).toBeVisible();
    await expect(page.locator('#playbookResultCount')).toHaveText('22 situations');
    const categoryOptions = page.locator('#playbookCategory option');
    await expect(categoryOptions).toHaveText(['All categories', 'Cutoffs & Relays', 'Backups & Rotations', 'Base Coverage']);
    expect(await page.evaluate(() => window.DIQ_TEACHING_CATEGORIES.length)).toBeGreaterThan(3);
    const currentCard = browser.locator('.playbook-situation-card.is-current');
    await expect(currentCard).toHaveCSS('background-color', await semanticColor(page, '--selection-background'));
    await expect(currentCard).toHaveCSS('border-left-color', await semanticColor(page, '--selection-border'));
    await expect(currentCard).toHaveCSS('box-shadow', 'none');
    await expect(currentCard).toHaveAttribute('aria-current', 'true');
    await expect(currentCard.locator('.playbook-card-current')).toHaveText('✓ Current');
    for (const [level, token] of [['foundational', '--success'], ['intermediate', '--info'], ['advanced', '--text-primary']]) {
      const label = browser.locator(`.playbook-card-difficulty[data-difficulty="${level}"]`).first();
      await expect(label).toHaveCSS('color', await semanticColor(page, token));
    }
    const currentLayout = await currentCard.evaluate(card => {
      const title = card.querySelector('.playbook-card-heading strong').getBoundingClientRect();
      const label = card.querySelector('.playbook-card-current');
      const bounds = label.getBoundingClientRect();
      const height = card.getBoundingClientRect().height;
      label.hidden = true;
      const heightWithoutLabel = card.getBoundingClientRect().height;
      label.hidden = false;
      return { besideTitle: bounds.left >= title.right && bounds.top < title.bottom, height, heightWithoutLabel };
    });
    expect(currentLayout.besideTitle).toBe(true);
    expect(currentLayout.height).toBe(currentLayout.heightWithoutLabel);
    const emptyCard=page.locator('.playbook-situation-card[data-situation-key="BD-01"]');
    await expect(emptyCard.locator('.training-base-map i')).toHaveCount(3);
    await expect(emptyCard.locator('.training-base-map .is-occupied')).toHaveCount(0);
    await expect(emptyCard.locator('.training-out-map i')).toHaveCount(2);
    await expect(emptyCard).toHaveAttribute('aria-label', /Bases empty, 0 outs/);
    expect(await page.evaluate(()=>{
      const fixture={title:'Line Drive to LF — Runner on First',runnersOn:{first:true,second:false,third:false},outs:2};
      const graphic=playbookStateGraphic(fixture);
      return {short:playbookCardTitle(fixture),mismatch:playbookCardTitle({...fixture,runnersOn:{}}),custom:playbookCardTitle({...fixture,title:'Custom — Keep this wording'}),occupied:graphic.querySelectorAll('.is-occupied').length,outs:graphic.querySelectorAll('.is-recorded').length};
    })).toEqual({short:'Line Drive to LF',mismatch:'Line Drive to LF — Runner on First',custom:'Custom — Keep this wording',occupied:1,outs:2});

    const layout = await page.locator('.playbook-browser-list').evaluate((list) => {
      const cards = [...list.querySelectorAll('.playbook-situation-card')].slice(0, 2);
      const [first, second] = cards.map((card) => card.getBoundingClientRect());
      return {
        pageOverflows: document.documentElement.scrollWidth > window.innerWidth,
        cardsOverlap: Boolean(
          first && second &&
          first.left < second.right && first.right > second.left &&
          first.top < second.bottom && first.bottom > second.top
        ),
      };
    });
    expect(layout).toEqual({ pageOverflows: false, cardsOverlap: false });

    await page.locator('#playbookDifficulty').selectOption('advanced');
    await expect(page.locator('.playbook-situation-card')).toHaveCount(9);
    await page.locator('#playbookClearFilters').click();
    await page.locator('#playbookCategory').selectOption('cutoffs-relays');
    await expect(page.locator('.playbook-situation-card')).toHaveCount(22);
    await page.locator('#playbookMoreFilters summary').click();
    await page.locator('#playbookHitOutcome').selectOption('Extra-base hits');
    await expect(page.locator('#playbookMoreFilterCount')).toHaveText('· 1 active');
    await expect(page.locator('.playbook-situation-card')).toHaveCount(8);

    await page.locator('#playbookSearch').fill('Left-Center');
    await expect(page.locator('.playbook-situation-card')).toHaveCount(2);
    // Historical codes remain searchable even though player headings use names only.
    await page.locator('#playbookSearch').fill('S14');
    await expect(page.locator('.playbook-situation-card')).toHaveCount(1);
    await page.locator('.playbook-situation-card[data-situation-key="BD-14"]').click();
    await expect(browser).toBeHidden();
    await expect.poll(() => page.evaluate(() => currentSituation?.key)).toBe('BD-14');
    await expect(page.locator('#descHud')).toHaveText('Hit to Left-Center Field');
    await expect(page.locator('.playbook-situation-card[data-situation-key="BD-14"] .playbook-card-heading strong')).toHaveText('Hit to Left-Center Field');
    await expect(page.locator('.playbook-situation-card[data-situation-key="BD-14"] .playbook-card-reference')).toHaveCount(0);
    await expect(page.locator('.playbook-situation-card[data-situation-key="BD-14"] .playbook-card-metadata')).toHaveText(/^(Foundational|Intermediate|Advanced) · Cutoffs & Relays$/);
  });

  test('guides a player through required practice and restores free play when staff closes it', async ({ page, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const coach = await requestFactory.newContext({ baseURL });
    let assignmentId = '';
    try {
      const coachLogin = await coach.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { role: 'coach', teamId: '13u-black', coachId: 'staff-coach', password: 'password' },
      });
      expect(coachLogin.ok()).toBeTruthy();
      const title = `Guided UI ${Date.now()}`;
      const created = await coach.post('/api/practice/assignments', {
        headers: { Origin: origin },
        data: {
          title,
          playerIds: ['13u-black-bob-smith-11'],
          situations: [{ situationKey: 'BD-02' }, { situationKey: 'BD-03' }],
          publish: true,
        },
      });
      expect(created.status()).toBe(201);
      assignmentId = (await created.json()).assignment.id;

      await page.setViewportSize({ width: 1440, height: 900 });
      await openCleanApp(page);
      await loginAsSeedPlayer(page);

      await expect(page.locator('#practiceToggle')).toBeVisible();
      await expect(page.locator('#practiceToggle')).toHaveAttribute('aria-label', 'Your Practice, 1 pending');
      await expect(page.locator('#practiceToggle .practice-toggle-count')).toHaveText('1');
      await expect(page.locator('#playbookBrowserToggle')).toBeDisabled();
      await expect(page.locator('#randomSitBtn')).toBeDisabled();

      await page.locator('#practiceToggle').click();
      const card = page.locator('.practice-assignment-card').filter({ hasText: title });
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: 'Start practice' }).click();
      await expect(page.locator('.field-card')).toBeVisible();
      await expect.poll(() => page.evaluate(() => currentSituation?.key)).toBe('BD-02');
      await expect(page.locator('#startBtn')).toBeEnabled();

      const attemptStart = page.waitForResponse((response) =>
        response.url().endsWith('/api/attempts') && response.request().method() === 'POST',
      );
      await page.locator('#startBtn').click();
      expect((await attemptStart).status()).toBe(201);
      await expect(page.locator('#resetBtn')).toBeDisabled();
      await expect.poll(async () => {
        const assignment = await page.request.get(`/api/practice/assignments/${assignmentId}`);
        const body = await assignment.json();
        return body.assignment.situations[0].progressStatus;
      }).toBe('incomplete');

      const abandonedAttempt = page.waitForResponse((response) => {
        if(!response.url().endsWith('/api/attempts') || response.request().method() !== 'POST') return false;
        try{ return response.request().postDataJSON()?.outcome === 'abandoned'; }
        catch{ return false; }
      });
      await page.evaluate(() => window._diqAbandonCurrentPlayAttempt('page_closed'));
      const abandonedResponse = await abandonedAttempt;
      expect(abandonedResponse.ok()).toBeTruthy();
      expect(await abandonedResponse.json()).toMatchObject({
        lifecycleStatus: 'abandoned',
        practiceProgressed: true,
        practice: {
          lockedAssignmentId: assignmentId,
          nextSituation: { situationKey: 'BD-03' },
        },
      });
      await expect(page.locator('#practiceAdvancePanel')).toBeVisible();
      await expect(page.locator('#practiceAdvanceTitle')).toHaveText('Attempt ended');
      await expect(page.locator('#resetBtn')).toBeDisabled();

      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
      await page.evaluate(() => window.__DIQ_READY__);
      await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('#11 Bob Smith');
      await expect.poll(() => page.evaluate(() => currentSituation?.key)).toBe('BD-03');
      await expect(page.locator('#playbookBrowserToggle')).toBeDisabled();
      await expect(page.locator('#resetBtn')).toBeDisabled();

      await page.setViewportSize({ width: 1024, height: 768 });
      await expect(page.locator('#practiceToggle')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024);

      const closed = await coach.patch(`/api/practice/assignments/${assignmentId}`, {
        headers: { Origin: origin },
        data: { action: 'close' },
      });
      expect(closed.ok()).toBeTruthy();
      await page.evaluate(() => window._diqRefreshPracticeState());
      await expect(page.locator('#playbookBrowserToggle')).toBeEnabled();
      await expect(page.locator('#randomSitBtn')).toBeEnabled();
      await expect(page.locator('#practiceToggle .practice-toggle-count')).toBeHidden();
    } finally {
      if (assignmentId) {
        await coach.patch(`/api/practice/assignments/${assignmentId}`, {
          headers: { Origin: origin },
          data: { action: 'archive' },
        });
      }
      await coach.dispose();
    }
  });

  test('modern strategy-board shell keeps controls organized and help accessible', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openCleanApp(page);

    await expect(page.getByRole('heading', { name: 'Diamond Defence' })).toBeVisible();
    await expect(page.locator('.situation-controls')).toBeVisible();
    await expect(page.locator('#trainingNavigation #playbookBrowserToggle')).toBeVisible();
    await expect(page.locator('#trainingNavigation #playbookToggle')).toBeVisible();
    const playerLayout = await page.evaluate(() => ({
      navigationBottom: document.getElementById('trainingNavigation').getBoundingClientRect().bottom,
      boardTop: document.querySelector('.training-board').getBoundingClientRect().top,
      headerLeft: document.getElementById('appHeader').getBoundingClientRect().left,
    }));
    expect(playerLayout.navigationBottom).toBeLessThanOrEqual(playerLayout.boardTop);
    expect(playerLayout.headerLeft).toBe(0);
    await expect(page.locator('#trainingWorkspaceHeading')).toBeHidden();
    await expect(page.locator('.training-board-label')).toBeHidden();
    await expect(page.locator('.game-controls')).toHaveCount(1);
    await expect(page.locator('#sitSelect')).toHaveCount(0);
    await expect(page.locator('#playbookBrowserToggle')).toBeVisible();
    await expect(page.locator('#randomSitBtn')).toBeVisible();
    await expect(page.locator('#descHud')).toHaveText('Single to LF');
    const commandLayout = await page.evaluate(() => {
      const account = document.querySelector('.account-actions');
      const utility = document.querySelector('.utility-actions');
      const situation = document.querySelector('.situation-controls');
      const field = document.querySelector('#fieldImg').getBoundingClientRect();
      const panel = document.querySelector('#trainingPanel').getBoundingClientRect();
      const hud = document.querySelector('#trainingHud').getBoundingClientRect();
      return {
        situationOrder: [...situation.children].map((element) => element.id).filter(Boolean),
        utilityOrder: [...utility.children].map((element) => element.id).filter(Boolean),
        accountOrder: [...account.children].map((element) => element.id).filter(Boolean),
        panelLeft: panel.left,
        fieldRight: field.right,
        hudParent: document.getElementById('trainingHud').parentElement.id,
        panelTop: panel.top,
        fieldTop: field.top,
      };
    });
    expect(commandLayout.situationOrder).toEqual(['playbookBrowserToggle', 'randomSitBtn']);
    expect(commandLayout.utilityOrder.slice(0, 3)).toEqual([
      'practiceToggle',
      'playbookToggle',
      'staffToolsBtn',
    ]);
    expect(commandLayout.accountOrder.slice(0, 2)).toEqual(['playerBtn', 'accountMenu']);
    expect(commandLayout.panelLeft).toBeGreaterThanOrEqual(commandLayout.fieldRight);
    expect(commandLayout.hudParent).toBe('trainingPanel');
    expect(Math.abs(commandLayout.panelTop - commandLayout.fieldTop)).toBeLessThanOrEqual(2);
    await expect(page.locator('#playerSituationName')).toHaveText('Single to LF');
    await expect(page.locator('#trainingActions #checkBtn')).toBeHidden();
    await expect(page.locator('#trainingMetrics #hud')).toBeVisible();
    await expect(page.locator('.status-strip')).toBeVisible();
    await expect(page.locator('.board-heading')).toHaveCount(0);
    await expect(page.locator('.position-legend')).toHaveCount(0);

    const help = page.locator('#howToDetails');
    await expect(help).toHaveAttribute('open', '');
    await expect(page.locator('.playbook-rail')).not.toBeVisible();
    const guideButton = page.getByRole('button', { name: 'Guide', exact: true });
    await expect(guideButton).toHaveAttribute('aria-expanded', 'false');
    await guideButton.click();
    await expect(page.locator('.playbook-rail')).toBeVisible();
    await expect(guideButton).toHaveAttribute('aria-expanded', 'true');
    await expect(guideButton).toHaveCSS('background-color', await semanticColor(page, '--accent-primary'));
    await expect(page.locator('.playbook-rail-heading')).toContainText('Guide');
    await expect(page.locator('#howToCard .howto-body')).toBeVisible();
    await expect(page.locator('#howToCard .howto-body')).toContainText('open Playbook');
    await expect(page.locator('#howToCard .howto-body')).not.toContainText('dropdown');
    await page.getByRole('button', { name: 'Close Guide' }).click();
    await expect(page.locator('.playbook-rail')).not.toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1920);

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
    await page.evaluate(() => window.__DIQ_READY__);
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guide' })).toBeVisible();
    await expect(page.locator('#staffToolsBtn')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Coach Tools' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Admin', exact: true })).toBeHidden();
    await expect(page.locator('#descHud')).toHaveText('Single to LF');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024);
  });

  test('small and portrait screens show the supported-screen boundary', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
    await page.evaluate(() => window.__DIQ_READY__);
    await expect(page.locator('#screenSizeGate')).toBeVisible();
    await expect(page.locator('#screenSizeGateTitle')).toHaveText(
      'Open Diamond Defence on a tablet or computer',
    );
    await expect(page.locator('#appHeader')).toBeHidden();
    await expect(page.locator('#fieldImg')).toBeHidden();

    await page.setViewportSize({ width: 1024, height: 1366 });
    await expect(page.locator('#screenSizeGate')).toBeVisible();

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator('#screenSizeGate')).toBeHidden();
    await expect(page.locator('#fieldImg')).toBeVisible();
  });

  test('all palettes render the recolored field at full strength', async ({ page }) => {
    await openCleanApp(page);
    const field = page.locator('#fieldImg');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic-ballpark');
    await expect(field).toHaveCSS('filter', 'none');
    await loginAsSeedPlayer(page);

    for (const viewport of [
      { width: 1920, height: 1200 },
      { width: 1280, height: 900 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(page.locator('body')).toHaveClass(/player-experience/);
      await expect(field).toHaveCSS('filter', 'none');
      await expect(field).toHaveAttribute('src', /diamond-defense-soft-field/);
    }

    const goldRunner = await semanticColor(page, '--runner');
    const header = page.locator('#appHeader');
    await expect(header).toHaveCSS('background-color', 'rgb(4, 33, 66)');
    await page.locator('html').evaluate(element => { element.dataset.theme = 'cobalt-daylight'; });
    await expect(header).toHaveCSS('background-color', 'rgb(237, 243, 245)');
    await expect(field).toHaveCSS('filter', 'none');
    expect(await semanticColor(page, '--runner')).toBe(goldRunner);
    await page.locator('html').evaluate(element => { element.dataset.theme = 'classic-dark'; });
    await expect(field).toHaveCSS('filter', 'none');
  });

  test('field geometry keeps every token aligned on supported screens', async ({ page }) => {
    for (const viewport of [
      { width: 1920, height: 1200 },
      { width: 1280, height: 900 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      await openCleanApp(page);

      const geometry = await page.evaluate(() => {
        const image = document.getElementById('fieldImg');
        const wrap = document.getElementById('wrap');
        const imageRect = image.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();

        return {
          imageWidth: imageRect.width,
          imageHeight: imageRect.height,
          wrapWidth: wrapRect.width,
          wrapHeight: wrapRect.height,
          viewportHeight: window.innerHeight,
          documentHeight: document.documentElement.scrollHeight,
          tokenOffsets: POS_IDS.map((position) => {
            const token = tokens.get(position);
            const tokenRect = token.el.getBoundingClientRect();
            const centerX = tokenRect.left + tokenRect.width / 2;
            const centerY = tokenRect.top + tokenRect.height / 2;
            const expectedX = imageRect.left + (token.pos.x * imageRect.width) / IMG_W;
            const expectedY = imageRect.top + (token.pos.y * imageRect.height) / IMG_H;

            return {
              position,
              x: Math.abs(centerX - expectedX),
              y: Math.abs(centerY - expectedY),
              size: tokenRect.width,
            };
          }),
        };
      });

      expect(geometry.imageWidth / geometry.imageHeight).toBeCloseTo(3200 / 2133, 3);
      expect(geometry.wrapWidth).toBeCloseTo(geometry.imageWidth, 1);
      expect(geometry.wrapHeight).toBeCloseTo(geometry.imageHeight, 1);
      expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.viewportHeight);

      for (const offset of geometry.tokenOffsets) {
        expect(
          offset.x,
          `${offset.position} horizontal offset at ${viewport.width}px`,
        ).toBeLessThan(1);
        expect(
          offset.y,
          `${offset.position} vertical offset at ${viewport.width}px`,
        ).toBeLessThan(1);
        expect(offset.size).toBeGreaterThanOrEqual(23);
        expect(offset.size).toBeLessThanOrEqual(40);
      }
    }
  });

  test('field retains the established coordinate landmarks and starting positions', async ({ page }) => {
    await openCleanApp(page);
    const alignment = await page.evaluate(() => ({
      landmarks:{home:{...BASES_NATIVE.home},first:{...BASES_NATIVE.first},second:{...BASES_NATIVE.second},third:{...BASES_NATIVE.third}},
      homeNative:{...HOME_NATIVE},
      starts:Object.fromEntries(POS_IDS.map(id=>[id,{...tokens.get(id).pos}])),
    }));
    expect(alignment.landmarks).toEqual({
      home: { x: 1577, y: 1734 },
      first: { x: 2170, y: 1304 },
      second: { x: 1572, y: 854 },
      third: { x: 962, y: 1305 },
    });
    expect(alignment.homeNative).toEqual(alignment.landmarks.home);
    expect(alignment.starts).toEqual({
      P: { x: 1570, y: 1240 },
      C: { x: 1578, y: 1833 },
      '1B': { x: 2081, y: 1172 },
      '2B': { x: 1934, y: 941 },
      SS: { x: 1202, y: 935 },
      '3B': { x: 1047, y: 1170 },
      LF: { x: 750, y: 679 },
      CF: { x: 1570, y: 476 },
      RF: { x: 2385, y: 683 },
    });

    expect(alignment.starts.C.y).toBeGreaterThan(alignment.landmarks.home.y + 90);
    expect(alignment.starts['1B'].x).toBeLessThan(alignment.landmarks.first.x);
    expect(alignment.starts['3B'].x).toBeGreaterThan(alignment.landmarks.third.x);
    expect(alignment.starts['2B'].x).toBeGreaterThan(alignment.landmarks.second.x);
    expect(alignment.starts.SS.x).toBeLessThan(alignment.landmarks.second.x);
    expect(alignment.starts.CF.y).toBeLessThan(alignment.landmarks.second.y);
    expect(alignment.starts.CF.y).toBeGreaterThan(450);
    expect(alignment.starts.LF.y).toBeGreaterThan(650);
    expect(alignment.starts.RF.y).toBeGreaterThan(650);

  });

  test('Guide follows practice, positioning, review and throw stages', async ({ page }) => {
    await openCleanApp(page);
    const stages = await page.evaluate(() => {
      const read = () => {refreshGuideText();return howToBody.textContent;};
      const result = {ready:read()};
      startBtn.disabled = true; gameActive = true;
      result.positioning = read();
      _phase1Summary = {ok:false,scoreCorrect:1};
      result.review = read();
      _solutionReview = {watched:true};
      currentSituation.playSeq = ['LF','SS','2B'];
      result.solution = read();
      phase2Active = true;
      result.sequence = read();
      phase2Active = false; _phase2Ended = true; allowSeqPanel = true;
      result.complete = read();
      document.getElementById('practiceWorkspace').classList.remove('hidden');
      result.practice = read();
      return result;
    });
    expect(stages.ready).toContain('Start Situation');
    expect(stages.positioning).toContain('Check Positions');
    expect(stages.review).toContain('Coaching notes become available after');
    expect(stages.solution).toContain('Continue to Throw Sequence');
    expect(stages.sequence).toContain('Verify Sequence');
    expect(stages.sequence).not.toContain('Select Continue');
    expect(stages.complete).toContain('Situation complete');
    expect(stages.complete).not.toContain('Verify Sequence');
    expect(stages.practice).toContain('Your Practice');
    expect(stages.practice).not.toContain('Verify Sequence');
  });

  test('Guide pauses live play and resumes from the same state', async ({ page }) => {
    await openCleanApp(page);
    await loginAsSeedPlayer(page);
    await page.locator('#startBtn').click();
    await page.locator('#playbookToggle').click();
    await expect(page.locator('body')).toHaveClass(/guide-open/);
    await expect(page.locator('#playbookClose')).toHaveText('×');
    expect(await page.locator('#playbookRail').evaluate(el=>el.parentElement.id)).toBe('appWorkspace');
    const snapshot = () => page.evaluate(() => ({
      seconds:_timerSecs, tries:remainingTries,
      ball:[ballEl.style.left,ballEl.style.top],
      batter:[runnerEl?.style.left,runnerEl?.style.top],
      runners:[...document.querySelectorAll('.baseRunner,.movingRunner')].map(el=>[el.style.left,el.style.top]),
      positions:POS_IDS.map(id=>({...tokens.get(id).pos})),
    }));
    const paused = await snapshot();
    await page.waitForTimeout(1300);
    expect(await snapshot()).toEqual(paused);
    expect(await page.locator('.training-board').evaluate(el=>el.inert)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveClass(/guide-open/);
    await expect(page.locator('#playbookToggle')).toBeFocused();
    expect(await page.locator('.training-board').evaluate(el=>el.inert)).toBe(false);
    await expect.poll(async () => (await snapshot()).seconds).toBeLessThan(paused.seconds);
    await expect.poll(async () => (await snapshot()).ball).not.toEqual(paused.ball);
    await page.locator('#playbookToggle').click();
    const pausedAgain = await snapshot();
    await page.waitForTimeout(1100);
    expect(await snapshot()).toEqual(pausedAgain);
    await page.locator('#playbookClose').click();
    await expect(page.locator('body')).not.toHaveClass(/guide-open/);
  });

  test('start, check, and reset preserve the round state contract', async ({ page }) => {
    await openCleanApp(page);
    await loginAsSeedPlayer(page);

    const start = page.locator('#startBtn');
    const reset = page.locator('#resetBtn');
    const check = page.locator('#checkBtn');

    await expect(start).toBeEnabled();
    await expect(reset).toBeDisabled();
    await expect(reset).toBeHidden();
    await expect(check).toBeDisabled();
    await expect(check).toBeHidden();
    expect(await page.evaluate(() => getPlayAnimationDuration())).toBe(4000);

    await page.evaluate(() => renderBaseRunners({ first: true, second: true, third: true }));
    await expect(page.locator('.baseRunner[data-base="first"]')).toHaveCSS('background-color', await semanticColor(page, '--runner'));
    const runnerLeads = await page.evaluate(() => ['first', 'second', 'third'].map((baseName) => {
      const marker = document.querySelector(`.baseRunner[data-base="${baseName}"]`);
      const actual = cssToUnit(parseFloat(marker.style.left), parseFloat(marker.style.top));
      const start = BASES_NATIVE[baseName];
      const destination = BASES_NATIVE[RUNNER_NEXT_BASE[baseName]];
      const dx = destination.x - start.x, dy = destination.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      return {
        forward: ((actual.x-start.x)*dx + (actual.y-start.y)*dy) / lengthSquared,
        outward: ((actual.x-start.x)*-dy + (actual.y-start.y)*dx) / lengthSquared,
      };
    }));
    runnerLeads.forEach((lead) => {
      expect(lead.forward).toBeCloseTo(0.14, 2);
      expect(lead.outward).toBeCloseTo(0.06, 2);
    });
    await page.evaluate(() => renderBaseRunners(liveRunners));

    await start.click();
    const hitTail = page.locator('#ballLayer .board-hit-path path');
    await expect(hitTail).toHaveCount(8);
    await expect(hitTail.first()).toHaveAttribute('opacity', '0.085');
    await expect(hitTail.last()).toHaveAttribute('opacity', '0.68');
    await expect(hitTail.last()).toHaveCSS('stroke', await semanticColor(page, '--field-hit-path'));
    await expect(start).toBeDisabled();
    await expect(start).toBeHidden();
    await expect(reset).toBeEnabled();
    await expect(check).toBeEnabled();
    await expect(reset).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('#triesVal')).toHaveText('3/3');
    await expect(page.locator('#timerVal')).toHaveCSS('color', await semanticColor(page, '--text-primary'));
    await page.evaluate(() => startTimer(10));
    await expect(page.locator('#timerBadge')).toHaveClass(/low/);
    await expect(page.locator('#timerVal')).toHaveCSS('color', await semanticColor(page, '--error'));
    await expect.poll(() => page.evaluate(() => runnerEl?.style.display)).toBe('none');
    await expect(page.locator('.baseRunner[data-base="first"]')).toHaveCount(1);
    await expect(page.locator('#ballLayer svg')).toHaveAttribute('data-hit-type', 'line_drive');
    await expect(page.locator('#ballLayer svg :is(path,ellipse)')).toHaveCount(0);

    await check.click();
    await expect(page.locator('#triesVal')).toHaveText('2/3');

    await reset.click();
    await expect(start).toBeEnabled();
    await expect(reset).toBeDisabled();
    await expect(reset).toBeHidden();
    await expect(check).toBeDisabled();
    await expect(check).toBeHidden();
    await expect(page.locator('#scoreVal')).toHaveText('0');
    await expect(page.locator('#ballLayer svg line, #ballLayer svg path')).toHaveCount(0);
  });

  test('resetting an active situation records one abandoned play attempt', async ({ page }) => {
    await openCleanApp(page);
    await loginAsSeedPlayer(page);

    const startedResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/attempts')
        && response.request().method() === 'POST'
        && !response.request().postDataJSON()?.outcome,
    );
    await page.getByRole('button', { name: 'Start Situation' }).click();
    const started = await startedResponse;
    expect(started.status()).toBe(201);
    expect(started.request().postDataJSON().situationSnapshot).toEqual(expect.objectContaining({
      playOutcome:expect.any(Object),
      runnerOutcomes:expect.any(Array),
    }));
    expect(started.request().postDataJSON().resolvedOutcome).toEqual(expect.objectContaining({
      finalRunners:expect.any(Object),
      runsScored:expect.any(Number),
      outsRecorded:expect.any(Number),
      finalOuts:expect.any(Number),
    }));
    const startedResult = await started.json();
    expect(startedResult).toMatchObject({
      created: true,
      lifecycleStatus: 'incomplete',
    });
    const savedResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/attempts')
        && response.request().method() === 'POST'
        && response.request().postDataJSON()?.outcome === 'abandoned',
    );
    await page.getByRole('button', { name: 'Reset' }).click();
    const response = await savedResponse;
    expect(response.status()).toBe(200);
    expect((await response.json()).attemptId).toBe(startedResult.attemptId);
    const payload = response.request().postDataJSON();
    expect(payload).toMatchObject({
      formatVersion: 2,
      outcome: 'abandoned',
      abandonReason: 'reset',
      situationKey: 'BD-01',
      phase: 1,
    });
    expect(payload.runId).toBeTruthy();
    expect(payload.startedAt).toBeTruthy();
    expect(payload.completedAt).toBeTruthy();

    const results = await page.evaluate(async (runId) => {
      const data = await (await fetch('./api/results/me')).json();
      return data.log.filter((attempt) => attempt.runId === runId);
    }, payload.runId);
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe('abandoned');
  });

  test('a positioning-only failure is saved without requiring a sequence', async ({ page }) => {
    await openCleanApp(page);
    await loginAsSeedPlayer(page);
    await page.evaluate(() => {
      currentSituation.playSeq = [];
      currentSituation.playSeq2 = [];
      currentSituation.runnersOn = { first: true, second: false, third: false };
      liveRunners = { ...currentSituation.runnersOn };
      renderBaseRunners(liveRunners);
    });

    await page.getByRole('button', { name: 'Start Situation' }).click();
    await page.evaluate(() => {
      for (const position of POS_IDS) {
        tokens.get(position).pos = { x: 0, y: 0 };
        placeToken(position);
      }
    });
    await page.getByRole('button', { name: 'Check Positions' }).click();
    await page.getByRole('button', { name: 'Check Positions' }).click();
    const savedResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/attempts')
        && response.request().method() === 'POST'
        && response.request().postDataJSON()?.outcome === 'failed',
    );
    await page.getByRole('button', { name: 'Check Positions' }).click();
    const response = await savedResponse;
    expect(response.status()).toBe(200);
    const payload = response.request().postDataJSON();
    expect(payload).toMatchObject({
      formatVersion: 2,
      outcome: 'failed',
      situationKey: 'BD-01',
      phase: 1,
      phase1: { ok: false, scoreCorrect: 0, scoreTotal: 9, triesUsed: 3 },
    });
    expect(payload.phase1Checks).toHaveLength(3);
    expect(payload.sequenceStages).toHaveLength(0);
    await expect(page.getByRole('button', { name: 'Choose another situation', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Watch Solution' })).toBeVisible();
    await expect(page.locator('.tgt.selectable')).toHaveCount(0);
    await expect(page.locator('#playerStepMessage')).toBeHidden();
    await expect(page.locator('#playerCoachingPrompt')).toBeHidden();
    await page.clock.install();
    await page.getByRole('button', { name: 'Watch Solution' }).click();
    expect(await page.evaluate(() => ({
      state: document.querySelector('#wrap')?.dataset.solutionState,
      ghosts: document.querySelectorAll('.solution-ghost').length,
      ballNearHome: (() => {
        const home = nativeToCssPoint(HOME_NATIVE);
        const hit = nativeToCssPoint(currentSituation.hit);
        const ball = { x: parseFloat(ballEl.style.left), y: parseFloat(ballEl.style.top) };
        return Math.hypot(ball.x - home.x, ball.y - home.y) < Math.hypot(ball.x - hit.x, ball.y - hit.y);
      })(),
      movingRunners: document.querySelectorAll('.movingRunner').length,
      batterVisible: runnerEl?.style.display !== 'none',
    }))).toEqual({
      state: 'animating',
      ghosts: 0,
      ballNearHome: true,
      movingRunners: 1,
      batterVisible: true,
    });
    await page.clock.runFor(12000);
    await expect(page.locator('#wrap')).toHaveAttribute('data-solution-state', 'ready');
    await expect(page.locator('.solution-ghost')).toHaveCount(9);
    await expect(page.locator('.solution-ghost').first()).toHaveCSS('border-top-color', await semanticColor(page, '--error'));
    await expect(page.locator('.solution-ghost').first()).toHaveCSS('border-top-style', 'dashed');
    await expect(page.locator('.tgt.selectable')).toHaveCount(9);
    expect(await page.evaluate(() => {
      const expectedRunners = resolveSituationOutcome(currentSituation).finalRunners;
      const finalReceiver = currentSituation.playSeq2?.at(-1) || currentSituation.playSeq.at(-1);
      const receiver = tokens.get(finalReceiver);
      const destination = nativeToCssPoint(receiver?.pos || currentSituation.hit);
      const ballDistance = Math.hypot(parseFloat(ballEl.style.left) - destination.x, parseFloat(ballEl.style.top) - destination.y);
      return {
        fieldersAtTargets: POS_IDS.every((position) => {
          const token = tokens.get(position)?.pos;
          const target = currentSituation?.targets?.[position];
          return token && target && Math.hypot(token.x - target.x, token.y - target.y) < 0.01;
        }),
        ballAtDestination: receiver ? ballDistance > (receiver.el.offsetWidth + ballEl.offsetWidth) / 2 : ballDistance < 0.01,
        runnersAtDestinations: JSON.stringify(normalizeRunnersOn(liveRunners)) === JSON.stringify(normalizeRunnersOn(expectedRunners)),
        staticRunnerBases: [...document.querySelectorAll('.baseRunner:not(.movingRunner)')]
          .map((runner) => runner.dataset.base)
          .sort(),
        staticRunnersAtBags: [...document.querySelectorAll('.baseRunner:not(.movingRunner)')]
          .every((runner) => {
            const expected = nativeToCssPoint(BASES_NATIVE[runner.dataset.base]);
            return Math.hypot(
              parseFloat(runner.style.left) - expected.x,
              parseFloat(runner.style.top) - expected.y,
            ) < 0.01;
          }),
        movingRunners: document.querySelectorAll('.movingRunner').length,
        batterVisible: runnerEl?.style.display !== 'none',
      };
    })).toEqual({
      fieldersAtTargets: true,
      ballAtDestination: true,
      runnersAtDestinations: true,
      staticRunnerBases: ['first', 'second'],
      staticRunnersAtBags: true,
      movingRunners: 0,
      batterVisible: false,
    });
  });

  test('player login rejects a wrong password and accepts a roster password', async ({ page }) => {
    await openCleanApp(page);

    await expect(page.locator('#startBtn')).toBeDisabled();
    await expect(page.locator('#startBtn')).toBeHidden();
    await expect(page.locator('#randomSitBtn')).toBeDisabled();
    await expect(page.locator('#gameLoginGate')).toBeVisible();

    await page.locator('#playerBtn').click();
    const playerModal = page.locator('#playerModalOverlay');
    await expect(playerModal).toBeVisible();
    await expect(playerModal).toHaveAttribute('role', 'dialog');
    await expect(playerModal).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#playerModalTitle')).toHaveText('Login');
    await expect(page.locator('#authPlayerTab')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#playerSidebarCard')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Share my results' })).toHaveCount(0);
    await expect(page.locator('#playerResultsStatus')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Copy Coach Review Code' })).toHaveCount(0);
    await page.locator('#playerTeamSelect').selectOption('13u-black');
    await page.locator('#playerNameSelect').selectOption('13u-black-bob-smith-11');

    await page.locator('#playerPass').fill('wrong-password');
    const wrongPasswordDialog = page.waitForEvent('dialog');
    await page.locator('#playerLoginBtn').click();
    const rejectedLogin = await wrongPasswordDialog;
    expect(rejectedLogin.message()).toBe('The selected account or password is incorrect.');
    await rejectedLogin.dismiss();
    await expect(page.locator('#playerLoginStatus')).toHaveCount(0);

    await page.locator('#playerPass').fill('password');
    await page.locator('#playerLoginBtn').click();

    await expect(playerModal).toBeHidden();
    await expect(page.locator('#playerIdText')).toHaveText('13u-black-bob-smith-11');
    await expect(page.getByRole('button', { name:'Start Situation' })).toBeEnabled();
    await expect(page.locator('#randomSitBtn')).toBeEnabled();
    await expect(page.locator('#gameLoginGate')).toBeHidden();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
    await page.evaluate(() => window.__DIQ_READY__);
    const logoutResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/logout') && response.request().method() === 'POST',
    );
    await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('#11 Bob Smith');
    await expect(page.locator('#staffToolsBtn')).toBeHidden();
    await page.locator('#playerBtn').click();
    await expect(page.locator('#accountMenu')).toBeVisible();
    await expect(page.locator('#accountMenuName')).toHaveText('Bob Smith');
    await expect(page.locator('#accountMenuMeta')).toHaveText('Player · #11 · 13U Black — Spring 2027');
    await page.locator('#accountSecurityBtn').click();
    await expect(page.locator('#accountMenu')).toBeHidden();
    await expect(page.locator('#accountSecurityOverlay')).toBeVisible();
    await expect(page.locator('#accountSecurityBtn')).toHaveAttribute('aria-expanded', 'true');
    const accountDrawerLayout = await page.evaluate(() => {
      const drawer = document.querySelector('#toolsDrawer');
      const panel = document.querySelector('#accountSecurityOverlay');
      const drawerRect = drawer.getBoundingClientRect();
      return {
        parentId: panel.parentElement.id,
        panelPosition: getComputedStyle(panel).position,
        drawerPosition: getComputedStyle(drawer).position,
        drawerWidth: drawerRect.width,
        viewportWidth: window.innerWidth,
        fieldRight: document.querySelector('.field-card').getBoundingClientRect().right,
        drawerLeft: drawerRect.left,
        drawerBottom: drawerRect.bottom,
        viewportHeight: window.innerHeight,
        horizontalOverflow: drawer.scrollWidth - drawer.clientWidth,
      };
    });
    expect(accountDrawerLayout.parentId).toBe('toolsDrawer');
    expect(accountDrawerLayout.panelPosition).toBe('static');
    expect(accountDrawerLayout.drawerPosition).toBe('fixed');
    expect(accountDrawerLayout.drawerWidth).toBeLessThanOrEqual(accountDrawerLayout.viewportWidth / 3 + 1);
    expect(accountDrawerLayout.fieldRight).toBeLessThanOrEqual(accountDrawerLayout.drawerLeft);
    expect(accountDrawerLayout.drawerBottom).toBeLessThanOrEqual(accountDrawerLayout.viewportHeight);
    expect(accountDrawerLayout.horizontalOverflow).toBeLessThanOrEqual(1);
    await page.locator('#accountSecurityClose').click();
    await expect(page.locator('#accountSecurityOverlay')).toBeHidden();
    await expect(page.locator('#accountSecurityBtn')).toHaveAttribute('aria-expanded', 'false');
    await logoutCurrentUser(page);
    expect((await logoutResponse).ok()).toBe(true);
    await expect(page.locator('#accountMenu')).toBeHidden();
    await expect(page.locator('#startBtn')).toBeDisabled();
    await expect(page.locator('#startBtn')).toBeHidden();
    await expect(page.locator('#gameLoginGate')).toBeVisible();
  });

  test('coach and admin tools enforce their current password gates', async ({ page }) => {
    await openCleanApp(page);

    await page.locator('#playerBtn').click();
    await page.locator('#authCoachTab').click();
    await expect(page.locator('#pwModal')).toBeVisible();
    await expect(page.locator('#coachLoginTeamSelect option[value="13u-black"]')).toHaveCount(1);
    await page.locator('#coachLoginTeamSelect').selectOption('13u-black');
    await page.locator('#coachLoginNameSelect').selectOption('staff-coach');
    await page.locator('#pwInput').fill('wrong');
    await page.locator('#pwOk').click();
    await expect(page.locator('#pwMsg')).toHaveText('The selected account or password is incorrect.');
    await page.locator('#pwInput').fill('password');
    await page.locator('#pwOk').click();
    await expect(page.locator('#playerModalOverlay')).toBeHidden();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
    await page.evaluate(() => window.__DIQ_READY__);
    await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('Jamie Rivera');
    await expect(page.locator('#staffToolsBtn')).toBeVisible();
    await expect(page.locator('#staffToolsBtn .staff-tools-label-full')).toHaveText('Coach workspace');
    await page.locator('#staffToolsBtn').click();
    await expect(page.locator('#coachCard')).toBeVisible();
    await expect(page.locator('#coachStatus')).toHaveText('unlocked');
    const coachTeamName = await page.evaluate(() => window.__DIQ_AUTH_USER__.teamName);
    expect(coachTeamName).toBeTruthy();
    await expect(page.locator('#coachIdentity')).toHaveText(coachTeamName);
    await expect(page.locator('#coachResultsWorkspace')).toBeVisible();
    await expect(page.locator('.field-card')).toBeHidden();
    const coachReviewLayout = await page.evaluate(() => {
      const drawer = document.querySelector('#toolsDrawer');
      const rect = drawer.getBoundingClientRect();
      const report = document.querySelector('#coachResultsWorkspace').getBoundingClientRect();
      const workspace = document.querySelector('#appWorkspace').getBoundingClientRect();
      return {
        parentId: document.querySelector('#coachCard').parentElement.id,
        controlsLeft: rect.left,
        controlsRight: rect.right,
        controlsBottom: rect.bottom,
        reportLeft: report.left,
        reportRight: report.right,
        reportTop: report.top,
        workspaceLeft: workspace.left,
        workspaceRight: workspace.right,
        horizontalOverflow: drawer.scrollWidth - drawer.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(coachReviewLayout.parentId).toBe('toolsDrawer');
    // Review uses full-width controls above the report, not the builder's side panel.
    expect(Math.abs(coachReviewLayout.controlsLeft - coachReviewLayout.workspaceLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(coachReviewLayout.controlsRight - coachReviewLayout.workspaceRight)).toBeLessThanOrEqual(1);
    expect(Math.abs(coachReviewLayout.reportLeft - coachReviewLayout.controlsLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(coachReviewLayout.reportRight - coachReviewLayout.controlsRight)).toBeLessThanOrEqual(1);
    expect(coachReviewLayout.controlsBottom).toBeLessThanOrEqual(coachReviewLayout.reportTop);
    expect(coachReviewLayout.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(coachReviewLayout.pageOverflow).toBeLessThanOrEqual(1);

    await page.locator('[data-coach-tab="assignments"]').click();
    await expect(page.locator('#practiceWorkspace')).toBeVisible();
    await expect(page.locator('#practiceLifecycleTabs [data-practice-view]')).toHaveCount(3);
    await expect(page.locator('[data-practice-view="active"]')).toHaveClass(/is-active/);
    await expect(page.locator('#practiceAssignmentForm')).toBeHidden();
    await page.locator('#practiceNewAssignment').click();
    await expect(page.locator('#practiceAssignmentForm')).toBeVisible();
    await expect(page.locator('#coachPracticeList')).toBeHidden();
    await page.locator('#practiceBuilderBack').click();
    await expect(page.locator('#practiceAssignmentForm')).toBeHidden();
    await expect(page.locator('#coachPracticeList')).toBeVisible();
    await expect(page.locator('#practiceSearch')).toBeVisible();
    await expect(page.locator('#practiceSort')).toHaveValue('newest');
    await page.locator('#practiceNewAssignment').click();
    await expect(page.locator('#practiceAssignmentForm')).toBeVisible();
    await expect(page.locator('#practiceSituationCategory option')).toHaveCount(13);
    await page.locator('#practiceSituationDifficulty').selectOption('advanced');
    await expect(page.locator('#practiceSituationChoices .practice-situation-choice:not(.hidden)')).toHaveCount(9);
    await expect(page.locator('#practiceSituationFilterSummary')).toHaveText('9 situations shown');
    await page.locator('#practiceSituationDifficulty').selectOption('');

    await logoutCurrentUser(page);
    await expect(page.locator('#staffToolsBtn')).toBeHidden();
    await page.locator('#playerBtn').click();
    await page.locator('#authAdminTab').click();
    await expect(page.locator('#adminPwModal')).toBeVisible();
    await page.locator('#adminPwInput').fill('wrong');
    await page.locator('#adminPwOk').click();
    await expect(page.locator('#adminPwMsg')).toHaveText('The selected account or password is incorrect.');
    await page.locator('#adminPwInput').fill('password');
    await page.locator('#adminPwOk').click();
    await expect(page.locator('#playerModalOverlay')).toBeHidden();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
    await page.evaluate(() => window.__DIQ_READY__);
    await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('Administrator');
    await expect(page.locator('#staffToolsBtn')).toBeVisible();
    await expect(page.locator('#staffToolsBtn .staff-tools-label-full')).toHaveText('Admin workspace');
    const fieldProposal = await page.evaluate(() => {
      const published = JSON.parse(JSON.stringify(SITUATIONS[0]));
      const proposed = JSON.parse(JSON.stringify(published));
      const targetId = Object.keys(proposed.targets)[0];
      proposed.targets[targetId].x += 40;
      proposed.title = `${published.title} proposed title`;
      proposed.hit.x = Math.min(3190, Number(proposed.hit.x) + 25);
      if (Array.isArray(proposed.playSeq) && proposed.playSeq.length > 1) {
        [proposed.playSeq[0], proposed.playSeq[1]] = [proposed.playSeq[1], proposed.playSeq[0]];
      }
      const addedCategory = (window.DIQ_TEACHING_CATEGORIES || [])
        .find((category) => category.id !== proposed.primaryCategory
          && !(proposed.relatedCategories || []).includes(category.id));
      proposed.relatedCategories = proposed.relatedCategories || [];
      if (addedCategory) proposed.relatedCategories.push(addedCategory.id);
      return {
        id: 'pending-field-proposal',
        submitterName: 'Coach Field Review',
        submissionType: 'update',
        situationKey: published.key,
        baseRevision: published.revision,
        createdAt: '2026-09-04T12:05:00.000Z',
        rationale: 'Move one defensive target.',
        targetId,
        publishedTitle: published.title,
        proposedTargetX: proposed.targets[targetId].x,
        addedCategoryLabel: addedCategory?.label,
        reviewKeys: SITUATIONS.slice(0, 2).map((situation) => situation.key),
        situation: proposed,
      };
    });
    const convertedOutcomeKeys = new Set(fieldProposal.reviewKeys);
    await page.route('**/api/situations/*', async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      const record = route.request().postDataJSON();
      convertedOutcomeKeys.delete(record.key);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ record: { ...record, revision: Number(record.revision) + 1 } }),
      });
    });
    await page.route('**/api/admin/situations', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.situations?.forEach((situation) => {
        if (convertedOutcomeKeys.has(situation.key) && situation.playOutcome) {
          situation.playOutcome.reviewStatus = 'needs_review';
        }
      });
      await route.fulfill({ response, json: body });
    });
    await page.route('**/api/situation-submissions?status=pending', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          submissions: [{
            id: 'pending-ui-proposal',
            submitterName: 'Coach Pending',
            submissionType: 'create',
            situationKey: 'PENDING-UI',
            baseRevision: null,
            createdAt: '2026-09-04T12:00:00.000Z',
            rationale: 'Verify the pending proposal interface.',
            situation: {
              ...fieldProposal.situation,
              key: 'PENDING-UI',
              displayCode: null,
              title: 'Pending UI Situation',
              revision: undefined,
            },
          }, fieldProposal],
        }),
      });
    });
    await page.locator('#staffToolsBtn').click();
    await expect(page.locator('#adminCard')).toBeVisible();
    await expect(page.locator('#adminStatus')).toHaveText('unlocked');
    await expect(page.locator('#coachCard')).toBeHidden();
    expect(await page.locator('#adminCard').evaluate((card) => card.parentElement.id)).toBe('toolsDrawer');
    await expect(page.locator('#adminWorkspace')).toBeVisible();
    await expect(page.locator('.field-card')).toBeHidden();
    await expect(page.locator('[data-admin-team-tab]')).toHaveCount(3);
    await expect(page.locator('[data-admin-team-view="roster"]')).toBeHidden();
    await expect(page.getByText(/^(Login ID|Coach account ID):/)).toHaveCount(0);
    expect(await page.locator('[data-admin-view="teams"]').evaluate((view) => view.parentElement.id)).toBe('adminWorkspace');
    expect(await page.locator('[data-admin-view="recovery"]').evaluate((view) => view.parentElement.id)).toBe('adminWorkspace');
    expect(await page.locator('[data-admin-view="situations"]').evaluate((view) => view.parentElement.id)).toBe('adminCard');
    await expect(page.locator('[data-admin-tab="situations"]')).toHaveClass(/has-pending/);
    await expect(page.locator('[data-admin-tab="situations"]')).toHaveCSS('background-color', await semanticColor(page, '--warning-muted'));
    await expect(page.locator('[data-admin-tab="situations"]')).toHaveCSS('color', await semanticColor(page, '--warning'));
    await expect(page.locator('#adminProposalSelect')).toHaveValue('pending-ui-proposal');
    await expect(page.locator('#adminProposalDetails')).toContainText('Coach Pending submitted a create');
    const existingTeamId = await page.locator('#adminTeamSelect option:not([value=""])').first().getAttribute('value');
    await page.locator('#adminTeamSelect').selectOption(existingTeamId);
    await expect(page.locator('#adminNewTeamBtn')).toHaveText('Create another team');
    await expect(page.locator('#adminRosterBrowser')).toBeVisible();
    await expect(page.locator('#adminPlayerName')).toBeHidden();
    await page.locator('#adminAddMember').click();
    await page.locator('#adminMemberType').selectOption('existing');
    await expect(page.locator('#adminUnassignedPlayerSelect')).toBeVisible();
    await page.locator('#adminMemberCancel').click();
    const playerRow = page.locator('#adminRosterRows tr[data-member-role="player"]').first();
    await playerRow.getByRole('button', { name: 'Manage member', exact: true }).click();
    await expect(page.locator('#adminPlayerPass')).toBeHidden();
    await expect(page.locator('#adminTransferPlayerWorkflow')).toBeHidden();
    await page.locator('#adminMemberSections').getByRole('button', { name: 'Team membership', exact: true }).click();
    await expect(page.locator('#adminTransferPlayerWorkflow')).toBeVisible();
    await expect(page.locator('#adminTransferPlayerSummary')).toContainText('Transfer #');
    await page.locator('#adminTransferPlayerSummary').click();
    await expect(page.locator('#adminTransferTeamSelect')).toBeVisible();
    await expect(page.locator('#adminPlayerAddBtn')).toBeHidden();
    await page.locator('#adminMemberCancel').click();
    await playerRow.getByRole('button', { name: 'Manage member', exact: true }).click();
    await page.locator('#adminMemberSections').getByRole('button', { name: 'Password', exact: true }).click();
    await expect(page.locator('#adminTransferPlayerWorkflow')).toBeHidden();
    await expect(page.locator('#adminPlayerName')).toBeHidden();
    await expect(page.locator('#adminPlayerPass')).toBeVisible();
    await page.locator('#adminMemberCancel').click();
    await page.locator('#adminAddMember').click();
    await expect(page.locator('#adminPlayerAddBtn')).toBeVisible();
    await expect(page.locator('#adminPlayerPass')).toBeVisible();
    await page.locator('#adminMemberCancel').click();
    await page.locator('#adminRosterRows tr[data-member-role="coach"]').first().getByRole('button', { name: 'Manage member', exact: true }).click();
    await expect(page.locator('#adminCoachAddBtn')).toBeHidden();
    await expect(page.locator('#adminCoachPass')).toBeHidden();
    await page.locator('#adminMemberCancel').click();
    await page.locator('#adminAddMember').click();
    await page.locator('#adminMemberType').selectOption('coach');
    await expect(page.locator('#adminCoachAddBtn')).toBeVisible();
    await page.locator('#adminMemberCancel').click();
    const adminWorkspaceLayout = await page.evaluate(() => {
      const drawer = document.querySelector('#toolsDrawer');
      const admin = document.querySelector('#adminCard');
      const workspace = document.querySelector('#adminWorkspace');
      return {
        drawerLeft: drawer.getBoundingClientRect().left,
        drawerWidth: drawer.getBoundingClientRect().width,
        viewportWidth: window.innerWidth,
        workspaceRight: workspace.getBoundingClientRect().right,
        horizontalOverflow: Math.max(
          drawer.scrollWidth - drawer.clientWidth,
          admin.scrollWidth - admin.clientWidth,
          workspace.scrollWidth - workspace.clientWidth,
        ),
      };
    });
    expect(adminWorkspaceLayout.drawerWidth).toBeGreaterThan(adminWorkspaceLayout.viewportWidth * 0.9);
    expect(adminWorkspaceLayout.workspaceRight).toBeLessThanOrEqual(adminWorkspaceLayout.viewportWidth);
    expect(adminWorkspaceLayout.horizontalOverflow).toBeLessThanOrEqual(1);
    await page.locator('[data-admin-team-tab="seasons"]').click();
    await expect(page.locator('[data-admin-team-view="seasons"]')).toBeVisible();
    await expect(page.locator('#adminAdvanceRosterTitle')).toContainText('roster');
    await expect(page.locator('#adminAdvanceRosterSource')).toContainText('From:');
    await expect(page.locator('#adminAdvanceDestinationSelect option').first()).toHaveText('Create a new destination team');
    await expect(page.locator('#adminAdvanceRosterBtn')).toBeDisabled();
    await page.locator('[data-admin-team-tab="data"]').click();
    await expect(page.locator('[data-admin-team-view="data"]')).toBeVisible();
    await expect(page.locator('#adminCleanupSeasonSelect')).toBeEnabled();
    await expect(page.locator('#adminCleanupGuidance')).toContainText('Close a season');
    await expect(page.locator('#adminPlayerClearSeasonBtn')).toBeDisabled();
    await page.getByText('CSV roster import', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Choose CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download template' })).toBeVisible();
    await page.locator('#adminTeamsCsvFile').setInputFiles({
      name: 'team-preview.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([
        'record_type,action,team_id,team_name,season_name,user_id,role,name,number,password',
        'team,upsert,browser-preview-team,Browser Preview Team,Spring 2027,,,,,',
      ].join('\n')),
    });
    await expect(page.locator('#adminCsvPreview')).toBeVisible();
    await expect(page.locator('#adminCsvSummary')).toContainText('Changes');
    await expect(page.locator('#adminCsvSummary')).toContainText('1');
    await expect(page.locator('.admin-csv-action.is-create')).toHaveText('create');
    await expect(page.locator('#adminCsvCommitBtn')).toBeDisabled();
    await page.locator('#adminCsvReviewConfirm').check();
    await expect(page.locator('#adminCsvCommitBtn')).toBeEnabled();
    await page.locator('#adminCsvCancelBtn').click();
    await expect(page.locator('#adminCsvPreview')).toBeHidden();
    await expect(page.getByRole('button', { name: /teams\.json|situations json|download all situations/i })).toHaveCount(0);
    await page.getByRole('button', { name: 'Situations', exact: true }).click();
    await expect(page.locator('#adminWorkspace')).toBeVisible();
    await expect(page.locator('.field-card')).toBeHidden();
    await expect(page.locator('#situationLibrary')).toBeVisible();
    const situationLibrary = page.locator('#situationLibrary');
    await situationLibrary.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(situationLibrary.locator('.situation-library-row input[type=checkbox]').first()).toBeVisible();
    await situationLibrary.locator('.situation-library-row input[type=checkbox]').first().check();
    await situationLibrary.getByRole('searchbox', { name: 'Search situations' }).fill('no-matching-situation');
    await expect(situationLibrary.getByRole('button', { name: 'Download selected (1)', exact: true })).toBeEnabled();
    await situationLibrary.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(situationLibrary.getByLabel('Situation export file')).toBeVisible();
    await expect(situationLibrary.locator('.situation-library-list')).toBeHidden();
    await situationLibrary.getByRole('button', { name: 'Library', exact: true }).click();
    await situationLibrary.getByRole('searchbox', { name: 'Search situations' }).fill('');

    await expect(situationLibrary.getByRole('button',{name:'Edit situation',exact:true}).first()).toBeVisible();
    await expect(situationLibrary.getByRole('button',{name:'Open classic editor',exact:true})).toHaveCount(0);
    await page.getByRole('button', { name:'Proposals to review', exact:true }).click();
    await page.locator('#adminProposalPreviewBtn').click();
    await expect(page.getByRole('button', { name: 'No published version', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'No published version', exact: true })).toBeDisabled();
    await expect(page.locator('.proposal-preview-bar')).toContainText('Pending UI Situation');
    await page.getByRole('button', { name: 'Return to proposal review', exact: true }).click();
    await expect(page.locator('[data-admin-tab="situations"]')).toHaveClass(/has-review-items/);
    await expect(page.locator('#adminOutcomeReviewQueue')).toBeVisible();
    await expect(page.locator('#adminOutcomeReviewSummary')).toContainText('must be confirmed');
    await expect(page.locator('#adminOutcomeReviewNextBtn')).toBeVisible();
    await page.locator('#adminOutcomeReviewNextBtn').click();
    await expect(page.getByRole('navigation',{name:'Editor tools'}).getByRole('button',{name:'Play timeline'})).toHaveAttribute('aria-current','page');
    await selectStage(page,'Review');
    await page.getByLabel('I confirm these play and runner outcomes').check();
    const outcomeResponse=page.waitForResponse(response=>response.request().method()==='PUT'&&response.url().includes('/api/situations/'));
    await page.getByRole('button',{name:'Publish Situation',exact:true}).click();
    const reviewed=(await (await outcomeResponse).json()).record;
    expect(fieldProposal.reviewKeys).toContain(reviewed.key);
    expect(reviewed.playOutcome.reviewStatus).toBe('ready');
    await page.goBack();
    await page.evaluate(()=>window.__DIQ_READY__);
    if(!await page.getByRole('button',{name:'Proposals to review',exact:true}).isVisible()){
      await page.locator('#staffToolsBtn').click();
      await page.getByRole('button',{name:'Situations',exact:true}).click();
    }
    await expect(page.locator(`#adminOutcomeReviewList button[data-situation-key="${reviewed.key}"]`)).toHaveCount(0);
    await page.getByRole('button',{name:'Proposals to review',exact:true}).click();
    await page.locator('#adminProposalSelect').selectOption(fieldProposal.id);
    const targetComparison = page.locator('.proposal-diff-row').filter({
      has: page.locator('input[data-proposal-field="targets"]'),
    });
    await expect(targetComparison).toContainText('1 of 9 target positions changed');
    await expect(targetComparison).toContainText(`${fieldProposal.targetId} moved`);
    await expect(targetComparison).not.toContainText('9 positions configured');
    await expect(page.locator('.proposal-diff-row').filter({
      has: page.locator('input[data-proposal-field="hit"]'),
    })).toContainText(/Moved 25 toward/);
    await expect(page.locator('.proposal-diff-row').filter({
      has: page.locator('input[data-proposal-field="playSeq"]'),
    })).toContainText('sequence steps changed');
    if (fieldProposal.addedCategoryLabel) {
      await expect(page.locator('.proposal-diff-row').filter({
        has: page.locator('input[data-proposal-field="relatedCategories"]'),
      })).toContainText(fieldProposal.addedCategoryLabel);
    }
    await page.locator('#adminProposalClearAllBtn').click();
    await expect(page.locator('#adminProposalPreviewBtn')).toBeDisabled();
    await page.locator('#adminProposalSelectAllBtn').click();
    await expect(page.locator('#adminProposalPreviewBtn')).toBeEnabled();
    await page.locator('input[data-proposal-field="title"]').uncheck();
    let previewAttemptRequests = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/attempts')) {
        previewAttemptRequests += 1;
      }
    });
    await page.locator('#adminProposalPreviewBtn').click();
    await expect(page.locator('body')).toHaveClass(/proposal-field-preview/);
    await expect(page.locator('.field-card')).toBeVisible();
    await expect(page.locator('#adminWorkspace')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Selected changes', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const selectedPreview = await page.evaluate(() => window._diqGetCurrentSituationSnapshot());
    expect(selectedPreview.title).toBe(fieldProposal.publishedTitle);
    expect(selectedPreview.targets[fieldProposal.targetId].x).toBe(fieldProposal.proposedTargetX);
    await expect(page.getByRole('button', { name: 'Start Situation', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Published version', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Published version', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Selected changes', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Start Situation', exact: true }).click();
    await page.evaluate(() => {
      for (const position of POS_IDS) {
        const target = currentSituation.targets[position];
        tokens.get(position).pos = { x: target.x, y: target.y };
        placeToken(position);
      }
    });
    await page.getByRole('button', { name: 'Check Positions', exact: true }).click();
    await page.getByRole('button', { name: 'Watch Solution', exact: true }).click();
    await expect(page.locator('#wrap')).toHaveAttribute('data-solution-state', 'ready');
    if (selectedPreview.playSeq?.length > 1) {
      await page.locator('#continueBtn').click();
      await expect(page.getByRole('button', { name: 'Verify Sequence', exact: true })).toBeVisible();
      await expect(page.locator('#seqPanel')).toBeHidden();
      for (const position of selectedPreview.playSeq) {
        const chip = page.locator('#wrap .chip').filter({ hasText: position });
        await expect(chip).toHaveCount(1);
        await chip.click();
      }
      await page.getByRole('button', { name: 'Verify Sequence', exact: true }).click();
    }
    expect(previewAttemptRequests).toBe(0);
    await page.getByRole('button', { name: 'Return to proposal review', exact: true }).click();
    await expect(page.locator('body')).not.toHaveClass(/proposal-field-preview/);
    await expect(page.locator('#adminProposalSelect')).toHaveValue(fieldProposal.id);
    await page.getByRole('button', { name: 'Recovery', exact: true }).click();
    await expect(page.locator('#adminWorkspace')).toBeVisible();
    await expect(page.locator('.field-card')).toBeHidden();
    await expect(page.locator('#adminArchivedTeamSelect')).toBeVisible();
    await expect(page.locator('#adminArchivedMemberSelect')).toBeVisible();
    await expect(page.locator('#adminArchivedSituationSelect')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0);

    await page.setViewportSize({ width: 1024, height: 768 });
    const compactDrawer = await page.locator('#toolsDrawer').evaluate((drawer) => {
      const rect = drawer.getBoundingClientRect();
      return { left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width };
    });
    expect(compactDrawer.left).toBeGreaterThanOrEqual(9);
    expect(compactDrawer.right).toBeLessThanOrEqual(1015);
    expect(compactDrawer.bottom).toBeLessThanOrEqual(768);
    expect(compactDrawer.width).toBeGreaterThan(900);
  });

  test('login service failures do not masquerade as a database outage', async ({ page }) => {
    await openCleanApp(page);
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Error' }),
      });
    });

    await page.locator('#playerBtn').click();
    await page.locator('#authCoachTab').click();
    await expect(page.locator('#coachLoginTeamSelect option[value="13u-black"]')).toHaveCount(1);
    await page.locator('#coachLoginTeamSelect').selectOption('13u-black');
    await page.locator('#coachLoginNameSelect').selectOption('staff-coach');
    await page.locator('#pwInput').fill('password');
    await page.locator('#pwOk').click();

    await expect(page.locator('#pwMsg')).toHaveText(
      'Login service is temporarily unavailable. Please try again.',
    );
    await expect(page.locator('#databaseUnavailable')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-diq-database',
      'unavailable',
    );
  });

  publishingTest('ball-only edits publish the moved position and retain it on the field', async ({ page, isolatePublishedSituation }) => {
    await openCleanApp(page);
    await page.locator('#playerBtn').click();
    await page.locator('#authAdminTab').click();
    await page.locator('#adminPwInput').fill('password');
    await page.locator('#adminPwOk').click();
    await page.locator('#staffToolsBtn').click();
    await page.getByRole('button', { name: 'Situations', exact: true }).click();
    const original=(await (await page.request.get('/api/situations')).json())[0];
    await isolatePublishedSituation(original);
    await page.goto('/coach-board');
    await openLibraryPlay(page,'situation',original.key,original.title);
    await openBattedBall(page,{outcomes:true});
    await expect(page.getByRole('button',{name:'Move batted ball',exact:true})).toHaveCount(0);
    const ball=page.getByRole('button',{name:'Drag batted ball',exact:true});
    await ball.scrollIntoViewIfNeeded();
    const hit=await ball.boundingBox();
    const field=await page.getByRole('group',{name:'Baseball play field'}).boundingBox();
    const firstBase={x:2170,y:1304};
    const x=hit.x+hit.width/2,y=hit.y+hit.height/2;
    await page.mouse.move(x,y);
    await page.mouse.down();
    await page.mouse.move(field.x+field.width*firstBase.x/3200,field.y+field.height*firstBase.y/2133,{steps:6});
    await page.mouse.up();
    await expect(page.getByRole('button',{name:'Edit batted ball action',exact:true})).toHaveAttribute('aria-expanded','true');
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    await expect.poll(async()=> (await ball.boundingBox()).x).toBeCloseTo(hit.x);
    await page.getByRole('button',{name:'Redo',exact:true}).click();
    const name=page.getByLabel('Situation name');
    const suggestion=page.getByRole('region',{name:'Board details'}).getByText(/^Suggested name .* to First Base/);
    await expect(suggestion).toBeVisible();
    await expect(name).toHaveValue(original.title);
    const suggestedTitle=(await suggestion.innerText()).replace('Suggested name — ','');
    await page.getByRole('button',{name:'Use suggested name',exact:true}).click();
    await expect(name).toHaveValue(suggestedTitle);
    await expect(suggestion).toHaveCount(0);
    await selectStage(page,'Review');
    await page.getByLabel('I confirm these play and runner outcomes').check();
    const savedResponse=page.waitForResponse(response=>response.url().endsWith(`/api/situations/${original.key}`)&&response.request().method()==='PUT');
    await page.getByRole('button',{name:'Publish Situation',exact:true}).click();
    const {record}=await (await savedResponse).json();
    expect(Math.abs(record.hit.x-firstBase.x)).toBeLessThan(10);
    expect(Math.abs(record.hit.y-firstBase.y)).toBeLessThan(10);
    expect(record.title).toBe(suggestedTitle);
    expect(record.ballLocation).toBe('First Base');
    const reloaded=(await (await page.request.get('/api/situations')).json()).find(item=>item.key===original.key);
    expect(reloaded.hit).toEqual(record.hit);
    expect(reloaded.ballLocation).toBe(record.ballLocation);

  });

  publishingTest('admin publishes all situation fields and reloads them without losing draft edits', async ({ page, isolatePublishedSituation }) => {
    await openCleanApp(page);
    await page.locator('#playerBtn').click();
    await page.locator('#authAdminTab').click();
    await page.locator('#adminPwInput').fill('password');
    await page.locator('#adminPwOk').click();
    await page.locator('#staffToolsBtn').click();
    await page.getByRole('button', { name: 'Situations', exact: true }).click();
    const original=(await (await page.request.get('/api/situations')).json())[0];
    await isolatePublishedSituation(original);
    await page.goto('/coach-board');
    await openLibraryPlay(page,'situation',original.key,original.title);
    await page.getByLabel('Situation name').fill('Published field coverage');
    await selectStage(page,'Details');
    await page.getByLabel('Player context').fill('All editor changes persist');
    await page.getByLabel('Staff variant').fill('Staff-only fixture');
    await page.getByLabel('Difficulty').selectOption('advanced');
    await selectStage(page,'Starting situation');
    await page.getByRole('combobox',{name:'Outs',exact:true}).selectOption('1');
    await page.getByRole('checkbox',{name:'first',exact:true}).check();
    await openBattedBall(page,{outcomes:true});
    await page.getByLabel('Batted-ball type').selectOption('ground_ball');
    await expect(page.getByLabel('Ball location')).toHaveCount(0);
    await page.getByRole('combobox',{name:'Play result',exact:true}).selectOption('double');
    await page.getByRole('button',{name:'Use recommended outcomes'}).click();
    await expect(page.getByLabel('Batter result')).toHaveValue('second');
    await selectStage(page,'Review');
    await page.getByText('Scoring targets',{exact:true}).click();
    await page.getByRole('spinbutton',{name:'Target tolerance',exact:true}).fill('125');
    await page.getByLabel('Position notes').fill('Published pitcher coaching note');
    await page.getByText('Expected throws',{exact:true}).click();
    await page.getByLabel('Relay template').selectOption('CF,SS,3B');
    await page.getByLabel('Throw sequence note').fill('Published throw sequence note');
    await selectStage(page,'Review');
    await page.getByLabel('I confirm these play and runner outcomes').check();
    await page.getByRole('button',{name:'Publish Situation',exact:true}).click();
    await expect(page.getByRole('status',{name:''}).filter({hasText:'Situation changes saved.'})).toBeVisible();
    const record=(await (await page.request.get('/api/situations')).json()).find(item=>item.key===original.key);
    expect(record).toMatchObject({
      title:'Published field coverage',desc:'All editor changes persist',audience:{staffVariant:'Staff-only fixture'},difficulty:'advanced',
      ballLocation:'LF',outs:1,runnersOn:{first:true},hitType:'grounder',batterAdvance:2,
      playOutcome:{result:'double',batterResult:'second'},playSeq:['CF','SS','3B'],
      seqNote:'Published throw sequence note',targets:{P:{tol:125,notes:'Published pitcher coaching note'}}
    });

  });

  test('admin team edits use record-level APIs and preserve stable IDs', async ({ page }) => {
    await openCleanApp(page);
    await page.locator('#playerBtn').click();
    await page.locator('#authAdminTab').click();
    await page.locator('#adminPwInput').fill('password');
    await page.locator('#adminPwOk').click();
    await page.locator('#staffToolsBtn').click();
    await expect(page.locator('#adminCard')).toBeVisible();
    await expect(page.locator('#adminNewTeamBtn')).toBeVisible();
    await expect(page.locator('#adminTeamAddBtn')).toBeHidden();
    await expect(page.locator('#adminTeamHeaderFields')).toBeHidden();
    await page.locator('#adminNewTeamBtn').click();
    await expect(page.locator('#adminInitialSeasonField')).toBeVisible();
    await expect(page.locator('#adminNewTeamBtn')).toBeHidden();
    await expect(page.locator('#adminTeamAddBtn')).toBeVisible();
    await expect(page.locator('#adminTeamCancelCreateBtn')).toBeVisible();

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const teamName = `Browser Admin ${suffix}`;
    await page.locator('#adminTeamName').fill('');
    await page.locator('#adminTeamAddBtn').click();
    await expect(page.locator('#adminTeamName')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#adminInitialSeasonName')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#adminOperationStatus')).toHaveText(
      'Correct the highlighted team fields.',
    );
    await page.locator('#adminTeamName').fill(teamName);
    await page.locator('#adminInitialSeasonName').fill('Spring 2027');
    const createResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/admin/teams') && response.request().method() === 'POST',
    );
    await page.locator('#adminTeamAddBtn').click();
    const created = (await (await createResponse).json()).record;
    expect(created).toEqual(expect.objectContaining({ revision: 1 }));
    expect(created.id).toMatch(/^team-[0-9a-f-]{36}$/);
    const teamId = created.id;
    await expect(page.locator('#adminOperationStatus')).toHaveText('Team created.');
    await expect(page.locator('#adminNewTeamBtn')).toBeVisible();
    await expect(page.locator('#adminTeamAddBtn')).toBeHidden();

    await page.locator('#adminTeamSettings > summary').click();
    await page.locator('#adminTeamName').fill(`${teamName} Renamed`);
    const updateResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/api/admin/teams/${teamId}`) && response.request().method() === 'PUT',
    );
    await page.locator('#adminTeamUpdateBtn').click();
    const updated = (await (await updateResponse).json()).record;
    expect(updated).toEqual(expect.objectContaining({
      id: teamId,
      name: `${teamName} Renamed`,
      revision: 2,
    }));
    await expect(page.locator('#adminOperationStatus')).toHaveText('Team saved.');
    await page.locator('#adminTeamSettings > summary').click();

    await page.locator('#adminTeamRemoveBtn').click();
    await expect(page.locator('#adminConfirmDialog')).toBeVisible();
    await expect(page.locator('#adminConfirmTitle')).toHaveText('Archive team');
    await page.locator('#adminConfirmActionBtn').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#adminConfirmCancelBtn')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#adminConfirmActionBtn')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#adminConfirmDialog')).toBeHidden();
    await expect(page.locator('#adminTeamRemoveBtn')).toBeFocused();

    const archiveResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/api/admin/teams/${teamId}`)
      && response.request().method() === 'DELETE',
    );
    await page.locator('#adminTeamRemoveBtn').click();
    await page.locator('#adminConfirmActionBtn').click();
    expect((await archiveResponse).status()).toBe(200);
    await expect(page.locator('#adminOperationStatus')).toHaveText('Team archived.');
  });

  test('current pure helpers retain their established output', async ({ page }) => {
    await openCleanApp(page);

    const output = await page.evaluate(() => {
      const resolved = resolveSituationOutcome({
        key:'OUTCOME-01',
        outs:1,
        runnersOn:{first:true,second:true,third:false},
        batterAdvance:1,
        playOutcome:{result:'single',batterResult:'first',outsRecorded:0,reviewStatus:'ready'},
        runnerOutcomes:[
          {startingBase:'first',result:'third',taggedUp:false},
          {startingBase:'second',result:'home',taggedUp:false},
        ],
      });
      return {
        slug: slugify(' 13U Black / Smith '),
        looseSlug: slugifyLoose(`Coach's Team`),
        clampedLow: clampInt(-4, 0, 2),
        clampedHigh: clampInt(9, 0, 2),
        publishedSituationLabel: situationDisplayLabel({ key:'BD-02', desc:'Single to CF' }),
        generatedSituationLabel: situationDisplayLabel({ key:'S-MTMU286H-0', displayCode:'S21', title:'New Situation', desc:'Squeeze bunt' }),
        resolvedOutcome:{
          finalRunners:resolved.finalRunners,
          runsScored:resolved.runsScored,
          outsRecorded:resolved.outsRecorded,
          finalOuts:resolved.finalOuts,
        },
      };
    });

    expect(output).toEqual({
      slug: '13u-black-smith',
      looseSlug: 'coachs-team',
      clampedLow: 0,
      clampedHigh: 2,
      publishedSituationLabel: 'Single to CF',
      generatedSituationLabel: 'New Situation',
      resolvedOutcome:{
        finalRunners:{first:true,second:false,third:true},
        runsScored:1,
        outsRecorded:0,
        finalOuts:1,
      },
    });
  });

  test('structured outcomes independently resolve runner animation and play totals', async ({ page }) => {
    await openCleanApp(page);
    await page.emulateMedia({ reducedMotion:'reduce' });

    const output = await page.evaluate(async () => {
      currentSituation = normalizeSituation({
        key:'OUTCOME-ANIMATION-01',
        title:'Independent runner outcomes',
        outs:1,
        runnersOn:{first:true,second:true,third:false},
        batterAdvance:1,
        playOutcome:{result:'other',batterResult:'first',outsRecorded:1,reviewStatus:'ready'},
        runnerOutcomes:[
          {startingBase:'first',result:'out',outType:'force',outOrder:1,taggedUp:false},
          {startingBase:'second',result:'home',taggedUp:false},
        ],
      }, 0);
      const resolution = resolveSituationOutcome(currentSituation);
      liveRunners = { ...resolution.initialRunners };
      renderBaseRunners(liveRunners);
      await new Promise((resolve) => {
        let runnersDone = false;
        let batterDone = false;
        const finish = () => {
          if(!runnersDone || !batterDone)return;
          applyResolvedSituationOutcome(resolution);
          resolve();
        };
        animateExistingRunnersByOutcome(resolution, () => {
          runnersDone = true;
          finish();
        }, { duration:0 });
        animateBatterOutcome(resolution.batterResult, () => {
          batterDone = true;
          finish();
        }, { duration:0 });
      });
      return {
        liveRunners:normalizeRunnersOn(liveRunners),
        staticRunnerBases:[...document.querySelectorAll('.baseRunner:not(.movingRunner)')]
          .map((runner) => runner.dataset.base)
          .sort(),
        movingRunners:document.querySelectorAll('.movingRunner').length,
        playRuns:wrap.dataset.playRuns,
        playOuts:wrap.dataset.playOuts,
        playFinalOuts:wrap.dataset.playFinalOuts,
      };
    });

    expect(output).toEqual({
      liveRunners:{first:true,second:false,third:false},
      staticRunnerBases:['first'],
      movingRunners:0,
      playRuns:'1',
      playOuts:'1',
      playFinalOuts:'2',
    });
  });

  test('situation normalization retains the current data contract', async ({ page }) => {
    await openCleanApp(page);

    const result = await page.evaluate(() => {
      const normalized = normalizeSituation({
        key: 'NORMALIZE-01',
        title: 'Normalized',
        desc: 'Contract check',
        outs: 9,
        runnersOn: { first: 1, second: 0, third: true },
        hitType: 'unknown',
        hit: { x: 0.5, y: 0.25 },
      }, 0);
      return {
        normalized: {
          key: normalized.key,
          category: normalized.category,
          difficulty: normalized.difficulty,
          primaryCategory: normalized.primaryCategory,
          relatedCategories: normalized.relatedCategories,
          outs: normalized.outs,
          runnersOn: normalized.runnersOn,
          hitType: normalized.hitType,
          hit: normalized.hit,
        },
      };
    });

    expect(result.normalized).toEqual({
      key: 'NORMALIZE-01',
      category: 'General',
      difficulty: 'advanced',
      primaryCategory: 'cutoffs-relays',
      relatedCategories: ['backups-rotations', 'base-coverage'],
      outs: 2,
      runnersOn: { first: true, second: false, third: true },
      hitType: 'line',
      hit: { x: 1600, y: 533 },
    });
  });

  test('team and roster operations add, update, and remove records', async ({ page }) => {
    await openCleanApp(page);

    const result = await page.evaluate(() => {
      const initialCount = TEAMS.teams.length;
      const team = upsertTeam('Regression Team', 'regression@example.com');
      upsertPlayer(team.id, 'Test Player', '99', '9876');
      const player = findTeam(team.id).roster.find((item) => item.number === '99');
      const added = {
        teamCount: TEAMS.teams.length,
        teamId: team.id,
        playerName: player && player.name,
        playerId: player && player.playerId,
      };
      removePlayer(team.id, player.playerId);
      const rosterCountAfterRemove = findTeam(team.id).roster.length;
      removeTeam(team.id);

      return {
        initialCount,
        added,
        rosterCountAfterRemove,
        finalCount: TEAMS.teams.length,
      };
    });

    expect(result.added).toEqual({
      teamCount: result.initialCount + 1,
      teamId: 'regression-team',
      playerName: 'Test Player',
      playerId: 'regression-team-test-player-99',
    });
    expect(result.rosterCountAfterRemove).toBe(0);
    expect(result.finalCount).toBe(result.initialCount);
  });

  test('coach reviews replace the field and proposals restore it', async ({ page }) => {
    await openCleanApp(page);
    await loginAsSeedPlayer(page);
    const savedAttempt = await page.evaluate(async () => {
      const response = await fetch('./api/attempts', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({
          situationKey:'BD-01',
          situationTitle:'Color verification',
          initialPositions:{ P:{x:1600,y:1300}, C:{x:1600,y:1850} },
          phase1Checks:[{ positions:{ P:{x:1500,y:1200}, C:{x:1600,y:1850} }, scoreCorrect:5, scoreTotal:9 }],
          sequenceChecks:[{ stage:1, picked:['P','C'], expected:['P','C'], success:true }],
          situationSnapshot:{ targets:{ P:{x:1500,y:1200,tol:80} }, runnersOn:{first:true}, outs:1 },
          phase:2,
          success:true,
          triesUsed:1,
          timeElapsed:4,
          phase1Ok:false,
          phase1ScoreCorrect:5,
          phase1ScoreTotal:9,
          phase1TriesUsed:2,
          phase1Elapsed:12,
          picked:['LF', 'SS', '2B'],
        }),
      });
      return { status: response.status, ...(await response.json()) };
    });
    expect(savedAttempt.status).toBe(201);
    expect(savedAttempt.attemptId).toEqual(expect.any(String));
    await logoutCurrentUser(page);
    await page.locator('#playerBtn').click();
    await page.locator('#authCoachTab').click();
    await page.locator('#coachLoginTeamSelect').selectOption('13u-black');
    await page.locator('#coachLoginNameSelect').selectOption('staff-coach');
    await page.locator('#pwInput').fill('password');
    await page.locator('#pwOk').click();
    await page.locator('#staffToolsBtn').click();

    await expect(page.locator('[data-coach-tab="reviews"]')).toHaveClass(/is-active/);
    await expect(page.locator('[data-coach-tab="reviews"]')).toHaveCSS('background-color', await semanticColor(page, '--selection-background'));
    await expect(page.locator('#coachOverviewTab')).toHaveCSS('background-color', await semanticColor(page, '--selection-background'));
    await expect(page.locator('#coachResultsWorkspace')).toBeVisible();
    await expect(page.locator('.field-card')).toBeHidden();
    await expect(page.locator('#teamsSubsec')).toHaveCount(0);
    await expect(page.locator('#coachReviewInput')).toHaveCount(0);
    await expect(page.locator('#coachResultsSituationSelect')).toBeHidden();
    await page.locator('#coachMoreFilters summary').click();
    await expect(page.locator('#coachResultsSituationSelect')).toBeVisible();
    await expect(page.locator('#coachResultsSeasonSelect')).toBeVisible();
    await expect(page.locator('#coachResultsAssignmentSelect')).toBeVisible();
    await expect(page.locator('#coachResultsDifficultySelect')).toBeVisible();
    await expect(page.locator('#coachResultsCategorySelect')).toBeVisible();
    await expect(page.locator('#coachResultsActivitySelect')).toBeVisible();
    await expect(page.locator('#coachResultsOutcomeSelect')).toBeVisible();
    await page.locator('#coachDatePreset').selectOption('custom');
    await expect(page.locator('#coachResultsDateFrom')).toBeVisible();
    await expect(page.locator('#coachResultsDateTo')).toBeVisible();
    await expect(page.locator('#coachResultsSummary > .coach-summary-card')).toHaveCount(4);
    await expect(page.locator('#coachDevelopmentInsights')).toBeVisible();
    await expect(page.locator('#coachDevelopmentTitle')).toHaveText('Team development');
    await expect(page.locator('.coach-insight-card')).toHaveCount(2);
    await expect(page.locator('.coach-player-progress-card')).toHaveCount(0);
    await expect(page.locator('#coachReviewAttempts')).toBeHidden();
    await expect(page.locator('#coachResultsExportBtn')).toBeHidden();
    await page.locator('#coachAttemptsTab').click();
    await expect(page.locator('#coachReviewOverview')).toBeHidden();
    await expect(page.locator('#coachAttemptView')).toHaveValue('all');
    await expect(page.locator('#coachResultsExportBtn')).toBeVisible();

    await expect(page.locator('.coach-review-table thead')).toContainText('Player');

    await page.locator('#coachPlayerPicker summary').click();
    await page.locator('#coachPlayerChoices input[value="13u-black-bob-smith-11"]').check();
    await expect(page.locator('#coachPlayerChoices')).toBeVisible();
    await page.locator('#coachResultsApplyBtn').click();
    await expect(page.locator('#coachPlayerChoices')).toBeHidden();
    await page.locator('#coachPlayerPicker summary').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#coachPlayerChoices')).toBeHidden();
    await expect(page.locator('#coachPlayerPicker summary')).toBeFocused();
    await page.locator('#coachPlayerPicker summary').click();
    await page.locator('#coachResultsTitle').click();
    await expect(page.locator('#coachPlayerChoices')).toBeHidden();

    await expect(page.locator('.coach-review-table')).toBeVisible();
    await expect(page.locator('#coachDevelopmentTitle')).toHaveText('Player development');
    await expect(page.locator('#coachSelectedPlayerSummary')).toBeVisible();
    await page.locator('#coachOverviewTab').click();
    await expect(page.locator('#coachResultsPlayerSelect')).toHaveValues(['13u-black-bob-smith-11']);
    await expect(page.locator('#coachReviewOverview')).toBeVisible();
    await page.locator('#coachAttemptsTab').click();
    await expect(page.locator('.coach-player-progress-card')).toHaveCount(0);
    await expect(page.locator('.coach-review-table thead')).toContainText('When');
    await expect(page.locator('.coach-review-table th', { hasText:/^Player$/ })).toHaveCount(1);
    await expect(page.locator('.coach-review-table thead')).toContainText('Result');
    await expect(page.locator('.coach-review-table thead')).not.toContainText('Context');
    await expect(page.locator('.coach-review-table thead')).toContainText('Position score');
    await expect(page.locator('.coach-review-table thead')).not.toContainText('Tries');
    await expect(page.locator('.coach-review-table thead')).not.toContainText('Positioning Time');
    await expect(page.locator('.coach-review-table thead')).not.toContainText('Selected Sequence');
    await expect(page.locator('.coach-review-table th', { hasText:/^Phase$/ })).toHaveCount(0);
    await expect(page.locator('.coach-review-situation')).toHaveCount(0);
    await expect(page.locator('.coach-review-table')).not.toContainText('BD-01');
    await expect(page.locator('.coach-review-count').first()).toBeVisible();
    await expect(page.locator('.coach-review-count.is-warning', { hasText:'5/9' })).toBeVisible();
    expect(await page.locator('.coach-review-count').evaluateAll((counts) => counts.every((count) =>
      /is-(success|warning|fail)/.test(count.className)
      && getComputedStyle(count).padding === '0px'
      && getComputedStyle(count).backgroundColor === 'rgba(0, 0, 0, 0)'
    ))).toBe(true);
    const attemptRow = page.locator(`.coach-review-table tbody tr[data-attempt-id="${savedAttempt.attemptId}"]`);
    await expect(attemptRow).toBeVisible();
    await attemptRow.getByRole('button', { name:'Review attempt', exact:true }).click();
    const review = page.locator('#coachAttemptReview');
    await expect(review).toBeVisible();
    await expect(review.locator('.review-defender')).toHaveCount(2);
    await expect(review.locator('.review-target')).toHaveCount(1);
    await review.getByRole('button', { name:'Next recorded step' }).click();
    await expect(review.locator('[data-frame]')).toHaveText('Position check 1');
    await review.getByRole('button', { name:'Play', exact:true }).click();
    await expect(review.locator('output')).toHaveText('4 / 4');
    await expect(review.locator('.review-throw')).toHaveCount(1);
    await review.locator('input[type="range"]').focus();
    await page.keyboard.press('Home');
    await expect(review.locator('[data-frame]')).toHaveText('Starting positions');
    await page.keyboard.press('Escape');
    await expect(review).toHaveCount(0);
    await expect(attemptRow.getByRole('button', { name:'Review attempt', exact:true })).toBeFocused();
    await expect(page.getByText('Review →', { exact:true })).toHaveCount(0);
    await expect(page.getByRole('button', { name:'Back to results' })).toHaveCount(0);

    await page.locator('#coachResultsOutcomeSelect').selectOption('passed');
    await page.locator('#coachResultsApplyBtn').click();
    await expect(page.locator('.coach-review-badge.is-success', { hasText:'PASS' }).first()).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#coachResultsExportBtn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('diamond-defense-13u-black-results.csv');
    await expect(page.locator('#coachResultsStatus')).toContainText('CSV export downloaded');

    await page.locator('[data-coach-tab="proposals"]').click();
    await expect(page.locator('#coachResultsWorkspace')).toBeHidden();
    await expect(page.locator('.field-card')).toBeHidden();
    await expect(page.locator('#coachSituationEditorMount')).toBeVisible();
    await expect(page.locator('#situationLibrary')).toBeVisible();
    const proposalLibraryBounds = await page.locator('#situationLibrary').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return { left:bounds.left, right:bounds.right, width:bounds.width, viewport:document.documentElement.clientWidth };
    });
    expect(proposalLibraryBounds.left).toBeGreaterThanOrEqual(0);
    expect(proposalLibraryBounds.right).toBeLessThanOrEqual(proposalLibraryBounds.viewport + 1);
    expect(proposalLibraryBounds.width).toBeGreaterThan(proposalLibraryBounds.viewport / 2);
    await page.locator('#situationLibrary').getByRole('button',{name:'Propose changes',exact:true}).first().click();
    await expect(page.getByRole('navigation',{name:'Editor tools'}).getByRole('button')).toHaveCount(3);
    await page.getByLabel('Situation name').fill('Coach draft title');
    await selectStage(page,'Review');
    await page.getByLabel('Proposal reason').fill('Clarifies the player-facing coaching objective.');
    await page.getByRole('button',{name:'Preview as player',exact:true}).click();
    await expect(page.locator('body')).toHaveClass(/situation-player-preview/);
    await expect(page.locator('#chooseNextSituationBtn')).toBeHidden();
    await expect(page.locator('#playbookBrowserToggle')).toBeHidden();
    await expect(page.locator('#randomSitBtn')).toBeHidden();
    await page.getByRole('button',{name:'Return to editor',exact:true}).click();
    await expect(page.getByLabel('Situation name')).toHaveValue('Coach draft title');
    await expect(page.getByLabel('Proposal reason')).toHaveValue('Clarifies the player-facing coaching objective.');

  });

  test('a correct phase-one placement proceeds through the phase-two sequence', async ({ page }) => {
    await openCleanApp(page);
    await loginAsSeedPlayer(page);

    await page.getByRole('button', { name: 'Start Situation' }).click();
    await page.evaluate(() => {
      for (const position of POS_IDS) {
        const target = currentSituation.targets[position];
        tokens.get(position).pos = { x: target.x, y: target.y };
        placeToken(position);
      }
    });

    await page.getByRole('button', { name: 'Check Positions' }).click();
    await expect(page.locator('#scoreVal')).toHaveText('9');
    await expect(page.getByRole('button', { name: 'Watch Solution' })).toBeVisible();
    await expect(page.locator('#continueBtn')).toBeHidden();
    await expect(page.locator('.tgt.selectable')).toHaveCount(0);
    await expect(page.locator('#playerStepMessage')).toBeHidden();
    await expect(page.locator('#playerCoachingPrompt')).toBeHidden();
    await page.clock.install();
    await page.getByRole('button', { name: 'Watch Solution' }).click();
    await page.clock.runFor(12000);
    await expect(page.locator('#wrap')).toHaveAttribute('data-solution-state', 'ready');
    await expect(page.locator('#wrap .relay-badge')).toHaveCount(3);
    await expect(page.locator('#wrap .ball.is-thrown')).toHaveCSS('border-top-color','rgb(169, 87, 96)');
    await expect(page.locator('#playerStepMessage')).toBeHidden();
    await expect(page.locator('#playerCoachingPrompt')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/player-solution-state/);
    await expect(page.locator('#continueBtn')).toBeVisible();
    await expect(page.locator('.solution-ghost')).toHaveCount(0);
    await expect(page.locator('#fieldNotice')).toContainText(
      'Select a target ring to view its coaching notes.',
    );
    await expect(page.locator('#fieldNotice')).toHaveClass(/is-visible/);
    await expect(page.locator('#targetPanel')).toBeHidden();

    await page.locator('.tgt[data-id="P"]').click();
    await expect(page.locator('#targetPanelTitle')).toHaveText('Position Notes: P');
    await expect(page.locator('#playerCoachingPrompt')).toBeHidden();
    await expect(page.locator('#targetPanelBody')).toContainText('backup position');
    await expect(page.locator('#fieldNotice')).not.toHaveClass(/is-visible/);
    await expect(page.locator('#contextBar')).toBeVisible();
    await expect(page.locator('.playbook-rail')).not.toBeVisible();
    const notesLayout = await page.evaluate(() => {
      const context = document.querySelector('#contextBar');
      const contextRect = context.getBoundingClientRect();
      const fieldRect = document.querySelector('#fieldImg').getBoundingClientRect();
      return {
        parentClass: context.parentElement.className,
        contextLeft: contextRect.left,
        fieldRight: fieldRect.right,
      };
    });
    expect(notesLayout.parentClass).toContain('training-panel');
    expect(notesLayout.contextLeft).toBeGreaterThanOrEqual(notesLayout.fieldRight);

    await page.getByRole('button', { name: 'Close notes and review' }).click();
    await expect(page.locator('#contextBar')).toBeHidden();
    await page.locator('.tgt[data-id="P"]').click();
    await expect(page.locator('#contextBar')).toBeVisible();

    await page.locator('#continueBtn').click();
    await expect(page.locator('#fieldNotice')).not.toHaveClass(/is-visible/);
    await expect(page.locator('#targetPanel')).toBeHidden();
    for (const position of ['LF', 'SS', '2B']) {
      const chip = page.locator('#wrap .chip').filter({ hasText: position });
      await expect(chip).toHaveCount(1);
      await chip.click();
    }
    const badges = page.locator('#wrap .seq-badge');
    await expect(badges).toHaveCount(3);
    await expect(badges.first()).toHaveCSS('background-color', 'rgb(124, 196, 247)');
    const savedResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/attempts')
        && response.request().method() === 'POST'
        && response.request().postDataJSON()?.outcome === 'passed',
    );
    await page.getByRole('button', { name: 'Verify Sequence' }).click();
    const completedResponse = await savedResponse;
    expect(completedResponse.status()).toBe(200);
    const completedAttempt = completedResponse.request().postDataJSON();
    expect(completedAttempt).toMatchObject({
      formatVersion: 2,
      outcome: 'passed',
      situationKey: 'BD-01',
      phase: 2,
      phase1: { ok: true, scoreCorrect: 9, scoreTotal: 9 },
    });
    expect(completedAttempt.phase1Checks).toHaveLength(1);
    expect(completedAttempt.sequenceChecks).toHaveLength(1);
    expect(completedAttempt.sequenceStages).toHaveLength(1);

    await expect(page.locator('#seqPanel')).toBeVisible();
    await expect(page.locator('#seqBody')).toContainText('Correct sequence!');
    await expect(page.locator('#wrap .seq-locked .seq-badge')).toHaveCount(3);
    await expect(badges.first()).toHaveCSS('background-color', await semanticColor(page, '--success'));
    await page.locator('#playbookToggle').click();
    await expect(page.locator('#howToCard .howto-body')).toContainText('Situation complete');
    await expect(page.locator('#howToCard .howto-body')).not.toContainText('Verify Sequence');
    await expect(page.locator('#fieldPaletteToggle')).toHaveCount(0);
    await page.locator('#playbookClose').click();
    await expect(page.locator('.throwTrail')).toHaveCount(0);
    await expect(page.locator('#seqPanel')).toContainText('Play Review');
    const reviewDoesNotOverlap = await page.evaluate(() => {
      const contextRect = document.querySelector('#contextBar').getBoundingClientRect();
      const fieldRect = document.querySelector('#fieldImg').getBoundingClientRect();
      return contextRect.left >= fieldRect.right || contextRect.top >= fieldRect.bottom;
    });
    expect(reviewDoesNotOverlap).toBe(true);

    const phaseTwo = await page.evaluate(() => RESULTS.bySituation['BD-01'].lastPhase2Stage1);
    expect(phaseTwo).toEqual(expect.objectContaining({
      success: true,
      picked: ['LF', 'SS', '2B'],
    }));
  });

  test('recorded attempts persist with a summary for their situation', async ({ page }) => {
    await openCleanApp(page);
    await loginAsSeedPlayer(page);

    const marker = `regression-test-${Date.now()}`;
    const countBefore = await page.evaluate(() => RESULTS.log.length);
    const savedResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/attempts') && response.request().method() === 'POST',
    );

    const saved = await page.evaluate((situationTitle) => {
      recordAttempt({
        formatVersion: 2,
        runId: situationTitle,
        outcome: 'passed',
        phase: 1,
        situationKey: 'BD-01',
        phase1: {
          ok: true,
          scoreCorrect: 7,
          scoreTotal: 9,
          triesUsed: 2,
          elapsed: 14,
          completedAt: new Date().toISOString(),
        },
        score: 7,
        total: 9,
        triesUsed: 2,
        timeElapsed: 14,
      });
      return {
        log: RESULTS.log,
        summary: RESULTS.bySituation['BD-01'],
      };
    }, marker);
    expect((await savedResponse).status()).toBe(201);

    expect(saved.log).toHaveLength(countBefore + 1);
    expect(saved.log).toEqual(expect.arrayContaining([
      expect.objectContaining({ runId: marker }),
    ]));
    expect(saved.summary.attempts).toBeGreaterThanOrEqual(1);
    expect(saved.summary.bestPhase1.score).toBeGreaterThanOrEqual(7);
    expect(saved.summary.bestPhase1.total).toBe(9);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
    await page.evaluate(() => window.__DIQ_READY__);
    const restored = await page.evaluate((runId) => ({
      attempts: RESULTS.bySituation['BD-01']?.attempts,
      hasMarker: RESULTS.log.some((entry) => entry.runId === runId),
    }), marker);
    expect(restored.attempts).toBeGreaterThanOrEqual(1);
    expect(restored.hasMarker).toBe(true);
  });
});

// Phase 2: navigation between real login forms and containment of dialog focus.
test('login role tabs support keyboard navigation and keep focus inside the dialog', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
  await page.locator('#playerBtn').click();
  await page.locator('#authPlayerTab').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#authCoachTab')).toBeFocused();
  await expect(page.locator('#authCoachTab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#coachLoginTeamSelect')).toBeVisible();
  await expect(page.locator('#playerTeamSelect')).toBeHidden();
  await page.keyboard.press('End');
  await expect(page.locator('#authAdminTab')).toBeFocused();
  await expect(page.locator('#adminPwInput')).toBeVisible();
  await page.locator('#adminPwOk').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#playerModalCloseX')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#adminPwOk')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#playerModalOverlay')).toBeHidden();
  await expect(page.locator('#playerBtn')).toBeFocused();
});

test('numbered runners preserve identities and size through animation and reset', async ({ page }) => {
  await openCleanApp(page);
  const result = await page.evaluate(async () => {
    resetRunnerPresentation();
    const numbers = {...offenseNumbers()};
    const combinations=[];
    for(let mask=0;mask<8;mask++){
      const state=Object.fromEntries(['first','second','third'].map((base,i)=>[base,Boolean(mask & (1<<i))]));
      renderBaseRunners(state);
      combinations.push({expected:Object.values(state).filter(Boolean).length,actual:wrap.querySelectorAll('.baseRunner').length});
    }
    renderBaseRunners({first:true,second:false,third:false});
    ensureRunner();
    const initial=wrap.querySelector('.baseRunner');
    const initialSize=initial.style.width;
    const batterSize=runnerEl.style.width;
    const initialNumber=initial.textContent;
    const moving=animateExistingRunnerFrom('first',1,{duration:50});
    const mover=wrap.querySelector('.movingRunner');
    const movingSize=mover.style.width;
    const movingNumber=mover.textContent;
    await moving;
    applyResolvedSituationOutcome({runnerOutcomes:[{startingBase:'first',result:'second'}],batterResult:'first',finalRunners:{first:true,second:true,third:false},runsScored:0,outsRecorded:0,finalOuts:0});
    const arrived=wrap.querySelector('.baseRunner[data-base="second"]');
    const expected=unitToCss(BASES_NATIVE.second);
    const arrival={number:arrived.textContent,size:arrived.style.width,onBag:Math.abs(parseFloat(arrived.style.left)-expected.left)<.01 && Math.abs(parseFloat(arrived.style.top)-expected.top)<.01};
    const batterNumber=wrap.querySelector('.baseRunner[data-base="first"]').textContent;
    resetPlayers();
    return {numbers,afterReset:offenseNumbers(),combinations,initialSize,batterSize,movingSize,initialNumber,movingNumber,arrival,batterNumber};
  });
  expect(new Set(Object.values(result.numbers)).size).toBe(4);
  Object.values(result.numbers).forEach(number=>{expect(number).toBeGreaterThan(9);expect(number).toBeLessThan(100);});
  expect(result.afterReset).toEqual(result.numbers);
  result.combinations.forEach(item=>expect(item.actual).toBe(item.expected));
  expect(result.batterSize).toBe(result.initialSize);
  expect(result.movingSize).toBe(result.initialSize);
  expect(result.movingNumber).toBe(result.initialNumber);
  expect(result.arrival.number).toBe(String(result.numbers.first));
  expect(result.arrival.size).toBe(result.initialSize);
  expect(result.arrival.onBag).toBe(true);
  expect(result.batterNumber).toBe(String(result.numbers.batter));
  await expect(page.locator('.starting-base-occupancy')).toHaveCount(0);
  await expect(page.locator('.chip[data-fielding-number="5"]')).toHaveText('3B');
  await expect(page.locator('.chip[data-fielding-number="6"]')).toHaveText('SS');
});


test('creating a variation through training stages preserves its source and assigns a tag on publish', async ({ page }) => {
  await openCleanApp(page);
  await page.locator('#playerBtn').click();
  await page.locator('#authAdminTab').click();
  await page.locator('#adminPwInput').fill('password');
  await page.locator('#adminPwOk').click();
  await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('Administrator');
  await page.locator('#staffToolsBtn').click();
  await page.getByRole('button', { name: 'Situations', exact: true }).click();
  const library = page.locator('#situationLibrary');
  const sourceTitle = await library.locator('.situation-library-row').first().locator('strong').first().textContent();
  const records = await (await page.request.get('/api/situations')).json();
  const source = records.find(record => sourceTitle.includes(record.title));
  expect(source).toBeDefined();
  await library.getByRole('button', { name: 'Create variation', exact: true }).first().click();
  const stages = page.getByRole('navigation', { name: 'Editor tools' });
  await expect(stages).toBeVisible();
  const title = `Training variation ${Date.now()}`;
  await page.getByLabel('Situation name').fill(title);
  await stages.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByLabel('I confirm these play and runner outcomes').check();
  await page.getByRole('button', { name: 'Publish Situation', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Situation created.');
  const published = await (await page.request.get('/api/situations')).json();
  const variation = published.find(record => record.title === title);
  expect(variation).toMatchObject({
    variationSourceKey: source.variationSourceKey || source.key,
    variationNumber: expect.any(Number),
  });
});
