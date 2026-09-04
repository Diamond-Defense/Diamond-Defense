import { test, expect, request as requestFactory } from '@playwright/test';

async function openCleanApp(page) {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
  await page.evaluate(() => window.__DIQ_READY__);
  await expect(page.locator('#fieldImg')).toBeVisible();
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
  await page.locator('#playerBtn').click();
  await expect(page.locator('#accountMenu')).toBeVisible();
  await page.locator('#accountLogoutBtn').click();
  await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('Login');
}

test.describe('Diamond Defense regression behavior', () => {
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
    await expect(field).toHaveAttribute('alt', 'Diamond Defense baseball strategy field');
    await expect(field).toHaveJSProperty('naturalWidth', 3200);
    await expect(field).toHaveJSProperty('naturalHeight', 2133);
    expect(await field.evaluate((image) => new URL(image.src).pathname)).toContain(
      'diamond-defense-dark-blue-neon-field',
    );
    await expect(field).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    expect(await page.evaluate(async () => (await fetch('/api/situations')).json().then((records) => records.length))).toBeGreaterThanOrEqual(22);
    await expect(page.locator('#wrap .chip')).toHaveCount(9);
    await expect(page.locator('#wrap .tgt')).toHaveCount(9);
    const appIcon = page.locator('.brand-mark img');
    await expect(appIcon).toBeVisible();
    await expect(appIcon).toHaveJSProperty('naturalWidth', 253);
    await expect(appIcon).toHaveJSProperty('naturalHeight', 256);
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
    expect(groupColors).toEqual({
      pitcher: 'rgb(244, 201, 93)',
      catcher: 'rgb(244, 201, 93)',
      infield: 'rgb(255, 107, 138)',
      outfield: 'rgb(67, 231, 244)',
      outfieldText: 'rgb(6, 18, 37)',
      chipBorder: 'rgb(225, 249, 255)',
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

    await page.locator('#randomSitBtn').click();
    await expect.poll(() => page.evaluate(() => currentSituation?.key)).not.toBe('BD-02');
  });

  test('Playbook browser filters database situations and selects one for practice', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCleanApp(page);
    await loginAsSeedPlayer(page);

    await page.getByRole('button', { name: 'Playbook', exact: true }).click();
    const browser = page.getByRole('dialog', { name: 'Playbook' });
    await expect(browser).toBeVisible();
    await expect(page.locator('#playbookResultCount')).toHaveText('22 situations');
    const layout = await page.locator('.playbook-browser-list').evaluate((list) => {
      const cards = [...list.querySelectorAll('.playbook-situation-card')].slice(0, 2);
      const [first, second] = cards.map((card) => card.getBoundingClientRect());
      return {
        pageOverflows: document.documentElement.scrollWidth > window.innerWidth,
        cardsOverlap: Boolean(first && second && second.top < first.bottom),
      };
    });
    expect(layout).toEqual({ pageOverflows: false, cardsOverlap: false });

    await page.locator('#playbookDifficulty').selectOption('advanced');
    await expect(page.locator('.playbook-situation-card')).toHaveCount(9);
    await page.locator('#playbookClearFilters').click();
    await page.locator('#playbookCategory').selectOption('cutoffs-relays');
    await expect(page.locator('.playbook-situation-card')).toHaveCount(22);
    await page.locator('#playbookHitOutcome').selectOption('Extra-base hits');
    await expect(page.locator('.playbook-situation-card')).toHaveCount(8);

    await page.locator('#playbookSearch').fill('Left-Center');
    await expect(page.locator('.playbook-situation-card')).toHaveCount(2);
    await page.locator('.playbook-situation-card[data-situation-key="BD-14"]').click();
    await expect(browser).toBeHidden();
    await expect.poll(() => page.evaluate(() => currentSituation?.key)).toBe('BD-14');
    await expect(page.locator('#descHud')).toHaveText('S14 · Hit to Left-Center Field');
    await expect(page.locator('.playbook-situation-card[data-situation-key="BD-14"] .playbook-card-heading strong')).toHaveText('S14 · Hit to Left-Center Field');
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

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('#practiceToggle')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

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

    await expect(page.getByRole('heading', { name: 'Diamond Defense' })).toBeVisible();
    await expect(page.locator('.situation-controls')).toBeVisible();
    await expect(page.locator('.game-controls')).toBeVisible();
    await expect(page.locator('#sitSelect')).toHaveCount(0);
    await expect(page.locator('#playbookBrowserToggle')).toBeVisible();
    await expect(page.locator('#randomSitBtn')).toBeVisible();
    await expect(page.locator('#descHud')).toHaveText('S01 · Single to LF');
    const commandLayout = await page.evaluate(() => {
      const account = document.querySelector('.account-actions');
      const utility = document.querySelector('.utility-actions');
      const situation = document.querySelector('.situation-controls');
      const ids = ['playerBtn', 'playbookBrowserToggle', 'randomSitBtn', 'playbookToggle', 'startBtn', 'resetBtn', 'checkBtn'];
      const orderedIds = ['playbookBrowserToggle', 'randomSitBtn', 'descHud', 'startBtn', 'runnersBadge', 'playbookToggle', 'playerBtn'];
      return {
        situationOrder: [...situation.children].map((element) => element.id).filter(Boolean),
        utilityOrder: [...utility.children].map((element) => element.id).filter(Boolean),
        accountOrder: [...account.children].map((element) => element.id).filter(Boolean),
        heights: ids.map((id) => Math.round(document.getElementById(id).getBoundingClientRect().height)),
        xPositions: orderedIds.map((id) => Math.round(document.getElementById(id).getBoundingClientRect().left)),
      };
    });
    expect(commandLayout.situationOrder).toEqual(['playbookBrowserToggle', 'randomSitBtn', 'descHud']);
    expect(commandLayout.utilityOrder.slice(0, 3)).toEqual([
      'practiceToggle',
      'playbookToggle',
      'staffToolsBtn',
    ]);
    expect(commandLayout.accountOrder.slice(0, 2)).toEqual(['playerBtn', 'accountMenu']);
    expect(new Set(commandLayout.heights).size).toBe(1);
    expect(commandLayout.xPositions).toEqual([...commandLayout.xPositions].sort((left, right) => left - right));
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
    await expect(guideButton).toHaveCSS('background-color', 'rgb(139, 124, 255)');
    await expect(page.locator('.playbook-rail-heading')).toContainText('Guide');
    await expect(page.locator('#howToCard .howto-body')).toBeVisible();
    await expect(page.locator('#howToCard .howto-body')).toContainText('open Playbook');
    await expect(page.locator('#howToCard .howto-body')).not.toContainText('dropdown');
    await page.getByRole('button', { name: 'Close Guide' }).click();
    await expect(page.locator('.playbook-rail')).not.toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1920);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
    await page.evaluate(() => window.__DIQ_READY__);
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guide' })).toBeVisible();
    await expect(page.locator('#staffToolsBtn')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Coach Tools' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Admin', exact: true })).toBeHidden();
    await expect(page.locator('#descHud')).toHaveText('S01 · Single to LF');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });

  test('field geometry keeps every token aligned on desktop and mobile', async ({ page }) => {
    for (const viewport of [
      { width: 1920, height: 1200 },
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
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
        expect(offset.size).toBeGreaterThanOrEqual(22);
        expect(offset.size).toBeLessThanOrEqual(38);
      }
    }
  });

  test('dark neon field preserves coordinate geometry and default alignment', async ({ page }) => {
    await openCleanApp(page);

    const alignment = await page.evaluate(() => {
      const image = document.getElementById('fieldImg');
      const canvas = document.createElement('canvas');
      canvas.width = IMG_W;
      canvas.height = IMG_H;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, IMG_W, IMG_H);

      const alphaAt = ({ x, y }) =>
        context.getImageData(Math.round(x), Math.round(y), 1, 1).data[3];
      const colorAt = ({ x, y }) =>
        [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data];
      const hasNeonNear = ({ x, y }, radius = 36) => {
        const startX = Math.max(0, Math.round(x - radius));
        const startY = Math.max(0, Math.round(y - radius));
        const width = Math.min(IMG_W - startX, radius * 2 + 1);
        const height = Math.min(IMG_H - startY, radius * 2 + 1);
        const pixels = context.getImageData(startX, startY, width, height).data;
        for (let index = 0; index < pixels.length; index += 4) {
          const [red, green, blue, alpha] = pixels.slice(index, index + 4);
          if (alpha > 220 && red > 180 && green > 200 && blue > 200) return true;
        }
        return false;
      };
      const landmarks = {
        home: { ...BASES_NATIVE.home },
        first: { ...BASES_NATIVE.first },
        second: { ...BASES_NATIVE.second },
        third: { ...BASES_NATIVE.third },
      };
      const starts = Object.fromEntries(
        POS_IDS.map((position) => [position, { ...tokens.get(position).pos }]),
      );
      const openHomeAreaPoints = [
        { x: 1425, y: 1842 },
        { x: 1578, y: 1833 },
        { x: 1733, y: 1843 },
      ];
      const batterBoxChalkPoints = [
        { x: 1473, y: 1695 },
        { x: 1438, y: 1745 },
        { x: 1511, y: 1746 },
        { x: 1473, y: 1798 },
        { x: 1685, y: 1695 },
        { x: 1644, y: 1746 },
        { x: 1718, y: 1746 },
        { x: 1685, y: 1798 },
      ];
      const catcherBoxChalkPoints = [
        { x: 1506, y: 1823 },
        { x: 1650, y: 1823 },
        { x: 1569, y: 1866 },
      ];
      const foulLineChalkPoints = [
        { x: 833, y: 1260 },
        { x: 2338, y: 1259 },
        { x: 1073, y: 1454 },
        { x: 2102, y: 1454 },
        { x: 1194, y: 1551 },
        { x: 1985, y: 1552 },
      ];
      const offSurfacePoints = [];
      const startingPlacementViolations = [];

      for (const situation of SITUATIONS) {
        for (const [groupName, points] of [
          ['start', situation.starts],
          ['target', situation.targets],
        ]) {
          for (const [position, point] of Object.entries(points || {})) {
            if (alphaAt(point) <= 220) {
              offSurfacePoints.push(`${situation.key} ${groupName} ${position}`);
            }
          }
        }
        if (situation.hit && alphaAt(situation.hit) <= 220) {
          offSurfacePoints.push(`${situation.key} hit`);
        }

        const situationStarts = situation.starts || {};
        if (Math.hypot(
          situationStarts.P.x - starts.P.x,
          situationStarts.P.y - starts.P.y,
        ) > 125) {
          startingPlacementViolations.push(`${situation.key} P`);
        }
        if (situationStarts.C.y <= landmarks.home.y + 90) {
          startingPlacementViolations.push(`${situation.key} C`);
        }
        if (situationStarts['1B'].x >= landmarks.first.x) {
          startingPlacementViolations.push(`${situation.key} 1B`);
        }
        if (situationStarts['3B'].x <= landmarks.third.x) {
          startingPlacementViolations.push(`${situation.key} 3B`);
        }
        if (situationStarts['2B'].x <= landmarks.second.x) {
          startingPlacementViolations.push(`${situation.key} 2B`);
        }
        if (situationStarts.SS.x >= landmarks.second.x) {
          startingPlacementViolations.push(`${situation.key} SS`);
        }
      }

      return {
        landmarks,
        homeNative: { ...HOME_NATIVE },
        starts,
        landmarkAlpha: Object.fromEntries(
          Object.entries(landmarks).map(([name, point]) => [name, alphaAt(point)]),
        ),
        startAlpha: Object.fromEntries(
          Object.entries(starts).map(([name, point]) => [name, alphaAt(point)]),
        ),
        transparentCorners: [
          alphaAt({ x: 0, y: 0 }),
          alphaAt({ x: IMG_W - 1, y: 0 }),
          alphaAt({ x: 0, y: IMG_H - 1 }),
          alphaAt({ x: IMG_W - 1, y: IMG_H - 1 }),
        ],
        darkBlueSurface: [
          colorAt(starts.LF),
          colorAt(starts.CF),
          colorAt(starts.RF),
          colorAt(starts.C),
        ],
        neonLandmarks: [
          hasNeonNear(landmarks.home, 55),
          hasNeonNear(landmarks.first, 40),
          hasNeonNear(landmarks.second, 40),
          hasNeonNear(landmarks.third, 40),
          hasNeonNear(starts.P, 40),
        ],
        openHomeAreaAlpha: openHomeAreaPoints.map(alphaAt),
        frontBoardDepthAlpha: alphaAt({ x: 1569, y: 1968 }),
        belowBoardAlpha: alphaAt({ x: 1569, y: 2045 }),
        batterBoxNeon: batterBoxChalkPoints.map((point) => hasNeonNear(point)),
        catcherBoxNeon: catcherBoxChalkPoints.map((point) => hasNeonNear(point)),
        foulLineNeon: foulLineChalkPoints.map((point) => hasNeonNear(point)),
        offSurfacePoints,
        startingPlacementViolations,
      };
    });

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

    for (const alpha of Object.values(alignment.landmarkAlpha)) {
      expect(alpha).toBeGreaterThan(220);
    }
    for (const alpha of Object.values(alignment.startAlpha)) {
      expect(alpha).toBeGreaterThan(220);
    }
    expect(alignment.transparentCorners).toEqual([0, 0, 0, 0]);
    for (const [red, green, blue, alpha] of alignment.darkBlueSurface) {
      expect(alpha).toBeGreaterThan(220);
      expect(blue).toBeGreaterThan(green);
      expect(green).toBeGreaterThan(red);
    }
    expect(alignment.neonLandmarks).toEqual([true, true, true, true, true]);
    expect(alignment.landmarks.first.x - alignment.landmarks.third.x).toBeGreaterThan(1200);
    expect(alignment.landmarks.home.y - alignment.landmarks.second.y).toBeGreaterThan(850);
    for (const alpha of alignment.openHomeAreaAlpha) {
      expect(alpha).toBeGreaterThan(220);
    }
    expect(alignment.frontBoardDepthAlpha).toBeGreaterThan(220);
    expect(alignment.belowBoardAlpha).toBeLessThan(16);
    expect(alignment.batterBoxNeon).toEqual([
      true, true, true, true, true, true, true, true,
    ]);
    expect(alignment.catcherBoxNeon).toEqual([true, true, true]);
    expect(alignment.foulLineNeon).toEqual([true, true, true, true, true, true]);
    expect(alignment.offSurfacePoints).toEqual([]);
    expect(alignment.startingPlacementViolations).toEqual([]);
  });

  test('start, check, and reset preserve the round state contract', async ({ page }) => {
    await openCleanApp(page);
    await loginAsSeedPlayer(page);

    const start = page.getByRole('button', { name: 'Start Situation' });
    const reset = page.getByRole('button', { name: 'Reset' });
    const check = page.getByRole('button', { name: 'Check Positions' });

    await expect(start).toBeEnabled();
    await expect(reset).toBeDisabled();
    await expect(check).toBeDisabled();

    await start.click();
    await expect(start).toBeDisabled();
    await expect(reset).toBeEnabled();
    await expect(check).toBeEnabled();
    await expect(reset).toHaveCSS('background-color', 'rgb(255, 177, 74)');
    await expect(page.locator('#triesVal')).toHaveText('3/3');

    await page.evaluate(() => renderBaseRunners({ first: true, second: false, third: false }));
    await expect(page.locator('.baseRunner[data-base="first"]')).toHaveCSS('background-color', 'rgb(180, 147, 255)');

    await check.click();
    await expect(page.locator('#triesVal')).toHaveText('2/3');

    await reset.click();
    await expect(start).toBeEnabled();
    await expect(reset).toBeDisabled();
    await expect(check).toBeDisabled();
    await expect(page.locator('#scoreVal')).toHaveText('0');
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
    await expect(page.getByRole('button', { name: 'Watch Solution' })).toBeVisible();
    await expect(page.locator('.tgt.selectable')).toHaveCount(0);
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
    await expect(page.locator('#wrap')).toHaveAttribute('data-solution-state', 'ready', { timeout: 7000 });
    await expect(page.locator('.solution-ghost')).toHaveCount(9);
    await expect(page.locator('.tgt.selectable')).toHaveCount(9);
    expect(await page.evaluate(() => {
      const advance = mapHitTypeToAdvance(currentSituation.hitType);
      const expectedRunners = advanceRunnersState(currentSituation.runnersOn, advance);
      if(advance === 1) expectedRunners.first = true;
      else if(advance === 2) expectedRunners.second = true;
      else if(advance === 3) expectedRunners.third = true;
      const hit = nativeToCssPoint(currentSituation.hit);
      return {
        fieldersAtTargets: POS_IDS.every((position) => {
          const token = tokens.get(position)?.pos;
          const target = currentSituation?.targets?.[position];
          return token && target && Math.hypot(token.x - target.x, token.y - target.y) < 0.01;
        }),
        ballAtHit: Math.hypot(parseFloat(ballEl.style.left) - hit.x, parseFloat(ballEl.style.top) - hit.y) < 0.01,
        runnersAtDestinations: JSON.stringify(normalizeRunnersOn(liveRunners)) === JSON.stringify(normalizeRunnersOn(expectedRunners)),
        movingRunners: document.querySelectorAll('.movingRunner').length,
        batterVisible: runnerEl?.style.display !== 'none',
      };
    })).toEqual({
      fieldersAtTargets: true,
      ballAtHit: true,
      runnersAtDestinations: true,
      movingRunners: 0,
      batterVisible: false,
    });
  });

  test('player login rejects a wrong password and accepts a roster password', async ({ page }) => {
    await openCleanApp(page);

    await expect(page.getByRole('button', { name:'Start Situation' })).toBeDisabled();
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
    await expect(page.getByRole('button', { name:'Start Situation' })).toBeDisabled();
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
    await expect(page.locator('#coachIdentity')).toContainText('Jamie Rivera');
    const coachDrawerLayout = await page.evaluate(() => {
      const drawer = document.querySelector('#toolsDrawer');
      const rect = drawer.getBoundingClientRect();
      return {
        parentId: document.querySelector('#coachCard').parentElement.id,
        position: getComputedStyle(drawer).position,
        drawerLeft: rect.left,
        drawerWidth: rect.width,
        viewportWidth: window.innerWidth,
        fieldRight: document.querySelector('.field-card').getBoundingClientRect().right,
        horizontalOverflow: drawer.scrollWidth - drawer.clientWidth,
        rightGap: window.innerWidth - rect.right,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
      };
    });
    expect(coachDrawerLayout.parentId).toBe('toolsDrawer');
    expect(coachDrawerLayout.position).toBe('fixed');
    expect(coachDrawerLayout.drawerWidth).toBeLessThanOrEqual(coachDrawerLayout.viewportWidth / 3 + 1);
    expect(coachDrawerLayout.fieldRight).toBeLessThanOrEqual(coachDrawerLayout.drawerLeft);
    expect(coachDrawerLayout.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(coachDrawerLayout.rightGap).toBeLessThanOrEqual(12);
    expect(coachDrawerLayout.bottom).toBeLessThanOrEqual(coachDrawerLayout.viewportHeight);

    await page.locator('[data-coach-tab="assignments"]').click();
    await expect(page.locator('#practiceWorkspace')).toBeVisible();
    await expect(page.locator('#practiceLifecycleTabs [data-practice-view]')).toHaveCount(5);
    await expect(page.locator('[data-practice-view="active"]')).toHaveClass(/is-active/);
    await expect(page.locator('#practiceSearch')).toBeVisible();
    await expect(page.locator('#practiceSort')).toHaveValue('newest');
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
    await page.locator('#staffToolsBtn').click();
    await expect(page.locator('#adminCard')).toBeVisible();
    await expect(page.locator('#adminStatus')).toHaveText('unlocked');
    await expect(page.locator('#coachCard')).toBeHidden();
    expect(await page.locator('#adminCard').evaluate((card) => card.parentElement.id)).toBe('toolsDrawer');
    await expect(page.locator('#adminWorkspace')).toBeVisible();
    await expect(page.locator('.field-card')).toBeHidden();
    await expect(page.locator('[data-admin-team-tab]')).toHaveCount(3);
    await expect(page.locator('[data-admin-team-view="roster"]')).toBeVisible();
    await expect(page.getByText(/^(Login ID|Coach account ID):/)).toHaveCount(0);
    expect(await page.locator('[data-admin-view="teams"]').evaluate((view) => view.parentElement.id)).toBe('adminWorkspace');
    expect(await page.locator('[data-admin-view="recovery"]').evaluate((view) => view.parentElement.id)).toBe('adminWorkspace');
    expect(await page.locator('[data-admin-view="situations"]').evaluate((view) => view.parentElement.id)).toBe('adminCard');
    const existingTeamId = await page.locator('#adminTeamSelect option:not([value=""])').first().getAttribute('value');
    await page.locator('#adminTeamSelect').selectOption(existingTeamId);
    await expect(page.locator('#adminNewTeamBtn')).toHaveText('Create another team');
    await expect(page.getByText('Add an unassigned player', { exact: true })).toBeVisible();
    await expect(page.locator('#adminUnassignedPlayerSelect')).toBeVisible();
    const existingPlayerId = await page.locator('#adminRosterSelect option:not([value=""])').first().getAttribute('value');
    await page.locator('#adminRosterSelect').selectOption(existingPlayerId);
    await expect(page.locator('#adminTransferPlayerWorkflow')).toBeVisible();
    await expect(page.locator('#adminTransferPlayerSummary')).toContainText('Transfer #');
    await page.locator('#adminTransferPlayerSummary').click();
    await expect(page.locator('#adminTransferTeamSelect')).toBeVisible();
    await expect(page.locator('#adminPlayerAddBtn')).toBeHidden();
    await page.locator('#adminRosterSelect').selectOption('');
    await expect(page.locator('#adminPlayerAddBtn')).toBeVisible();
    const existingCoachId = await page.locator('#adminCoachSelect option:not([value=""])').first().getAttribute('value');
    await page.locator('#adminCoachSelect').selectOption(existingCoachId);
    await expect(page.locator('#adminCoachAddBtn')).toBeHidden();
    await page.locator('#adminCoachSelect').selectOption('');
    await expect(page.locator('#adminCoachAddBtn')).toBeVisible();
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
    expect(adminWorkspaceLayout.drawerWidth).toBeLessThanOrEqual(adminWorkspaceLayout.viewportWidth / 3 + 1);
    expect(adminWorkspaceLayout.workspaceRight).toBeLessThanOrEqual(adminWorkspaceLayout.drawerLeft);
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
    await expect(page.locator('#adminWorkspace')).toBeHidden();
    await expect(page.locator('.field-card')).toBeVisible();
    await expect(page.locator('[data-admin-view="situations"]')).toBeVisible();
    await page.getByRole('button', { name: 'Recovery', exact: true }).click();
    await expect(page.locator('#adminWorkspace')).toBeVisible();
    await expect(page.locator('.field-card')).toBeHidden();
    await expect(page.locator('#adminArchivedTeamSelect')).toBeVisible();
    await expect(page.locator('#adminArchivedMemberSelect')).toBeVisible();
    await expect(page.locator('#adminArchivedSituationSelect')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileDrawer = await page.locator('#toolsDrawer').evaluate((drawer) => {
      const rect = drawer.getBoundingClientRect();
      return { left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width };
    });
    expect(mobileDrawer.left).toBeGreaterThanOrEqual(9);
    expect(mobileDrawer.right).toBeLessThanOrEqual(381);
    expect(mobileDrawer.bottom).toBeLessThanOrEqual(844);
    expect(mobileDrawer.width).toBeLessThanOrEqual(370);
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

    await page.locator('#adminTeamRemoveBtn').click();
    await expect(page.locator('#adminConfirmDialog')).toBeVisible();
    await expect(page.locator('#adminConfirmTitle')).toHaveText('Archive team');
    await page.locator('#adminConfirmCancelBtn').click();
    await expect(page.locator('#adminConfirmDialog')).toBeHidden();

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

    const output = await page.evaluate(() => ({
      slug: slugify(' 13U Black / Smith '),
      looseSlug: slugifyLoose(`Coach's Team`),
      clampedLow: clampInt(-4, 0, 2),
      clampedHigh: clampInt(9, 0, 2),
      publishedSituationLabel: situationDisplayLabel({ key:'BD-02', desc:'Single to CF' }),
      generatedSituationLabel: situationDisplayLabel({ key:'S-MTMU286H-0', displayCode:'S21', title:'New Situation', desc:'Squeeze bunt' }),
    }));

    expect(output).toEqual({
      slug: '13u-black-smith',
      looseSlug: 'coachs-team',
      clampedLow: 0,
      clampedHigh: 2,
      publishedSituationLabel: 'S02 · Single to CF',
      generatedSituationLabel: 'S21 · Squeeze bunt',
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
      return response.status;
    });
    expect(savedAttempt).toBe(201);
    await logoutCurrentUser(page);
    await page.locator('#playerBtn').click();
    await page.locator('#authCoachTab').click();
    await page.locator('#coachLoginTeamSelect').selectOption('13u-black');
    await page.locator('#coachLoginNameSelect').selectOption('staff-coach');
    await page.locator('#pwInput').fill('password');
    await page.locator('#pwOk').click();
    await page.locator('#staffToolsBtn').click();

    await expect(page.locator('[data-coach-tab="reviews"]')).toHaveClass(/is-active/);
    await expect(page.locator('#coachResultsWorkspace')).toBeVisible();
    await expect(page.locator('.field-card')).toBeHidden();
    await expect(page.locator('#teamsSubsec')).toHaveCount(0);
    await expect(page.locator('#coachReviewInput')).toHaveCount(0);
    await expect(page.locator('#coachResultsSituationSelect')).toBeVisible();
    await expect(page.locator('#coachResultsOutcomeSelect')).toBeVisible();
    await expect(page.locator('#coachResultsDateFrom')).toBeVisible();
    await expect(page.locator('#coachResultsDateTo')).toBeVisible();
    await expect(page.locator('.coach-summary-card')).toHaveCount(8);

    await expect(page.locator('.coach-review-table thead')).toContainText('Player');

    await page.locator('#coachResultsPlayerSelect').selectOption('13u-black-bob-smith-11');

    await expect(page.locator('.coach-review-table')).toBeVisible();
    await expect(page.locator('.coach-review-table thead')).toContainText('Date & Time');
    await expect(page.locator('.coach-review-table th', { hasText:/^Player$/ })).toHaveCount(0);
    await expect(page.locator('.coach-review-table thead')).toContainText('Result');
    await expect(page.locator('.coach-review-table thead')).toContainText('Score');
    await expect(page.locator('.coach-review-table thead')).toContainText('Tries');
    await expect(page.locator('.coach-review-table thead')).toContainText('Positioning Time');
    await expect(page.locator('.coach-review-table thead')).toContainText('Selected Sequence');
    await expect(page.locator('.coach-review-table th', { hasText:/^Phase$/ })).toHaveCount(0);
    await expect(page.locator('.coach-review-situation')).toHaveCount(0);
    await expect(page.locator('.coach-review-table')).not.toContainText('BD-01');
    await expect(page.locator('.coach-review-count').first()).toBeVisible();
    await expect(page.locator('.coach-review-count.is-warning', { hasText:'5/9' })).toBeVisible();
    await expect(page.locator('.coach-review-count.is-warning', { hasText:'2/3' })).toBeVisible();
    await expect(page.locator('.coach-review-count.is-success', { hasText:'1/3' }).first()).toBeVisible();
    expect(await page.locator('.coach-review-count').evaluateAll((counts) => counts.every((count) =>
      /is-(success|warning|fail)/.test(count.className)
      && getComputedStyle(count).padding === '0px'
      && getComputedStyle(count).backgroundColor === 'rgba(0, 0, 0, 0)'
    ))).toBe(true);
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
    await expect(page.locator('.field-card')).toBeVisible();
    await expect(page.locator('#coachSituationEditorMount')).toBeVisible();
    await expect(page.locator('#situationWorkflowRole')).toHaveText('Coach draft');
    await expect(page.locator('#situationDirtyBadge')).toHaveText('No draft changes');
    await expect(page.locator('#situationCategoryInput')).not.toHaveValue('');
    await expect(page.locator('#situationDifficultySelect')).toHaveValue(/^(foundational|intermediate|advanced)$/);
    await expect(page.locator('#situationPrimaryCategorySelect')).not.toHaveValue('');
    await expect(page.locator('#situationRelatedCategories input')).toHaveCount(11);
    await expect(page.locator('[data-editor-step]')).toHaveCount(6);
    await expect(page.locator('.situation-editor-actions #previewSituationBtn')).toHaveCount(0);
    await expect(page.locator('.situation-editor-actions #submitSituationBtn')).toHaveCount(0);
    await expect(page.locator('#situationReviewSection #situationValidationPanel')).toHaveCount(1);
    await expect(page.locator('#situationReviewSection #coachProposalRationale')).toHaveCount(1);
    await expect(page.locator('#situationReviewSection #previewSituationBtn')).toHaveCount(1);
    await expect(page.locator('#situationReviewSection #submitSituationBtn')).toHaveCount(1);
    await expect(page.locator('#downloadCurrentBtn')).toHaveCount(0);
    await expect(page.locator('.position-check')).toHaveCount(9);
    await expect(page.locator('#seqPosGrid .pos-btn', { hasText: /^LF$/ })).toBeDisabled();
    await page.locator('[data-editor-step="sbTargetsSubsec"]').click();
    await page.locator('.position-check', { hasText: /^RF/ }).click();
    await expect(page.locator('#tolTargetSel')).toHaveValue('RF');
    await page.locator('#newTitleInput').fill('Coach draft title');
    await expect(page.locator('#situationDirtyBadge')).toHaveText('Unsaved changes');
    await expect(page.locator('#submitSituationBtn')).toBeDisabled();
    await page.locator('#coachProposalRationale').fill('Clarifies the player-facing coaching objective.');
    await page.locator('#previewSituationBtn').click();
    await expect(page.locator('body')).toHaveClass(/situation-player-preview/);
    await expect(page.locator('.field-card')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Return to editor' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to editor' }).click();
    await expect(page.locator('body')).not.toHaveClass(/situation-player-preview/);
    await page.locator('#saveSituationBtn').click();
    await expect(page.locator('#situationDirtyBadge')).toHaveText('No draft changes');
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
    await expect(page.getByRole('button', { name: 'Continue ▶' })).toBeHidden();
    await expect(page.locator('.tgt.selectable')).toHaveCount(0);
    await page.getByRole('button', { name: 'Watch Solution' }).click();
    await expect(page.locator('#wrap')).toHaveAttribute('data-solution-state', 'ready');
    await expect(page.getByRole('button', { name: 'Continue ▶' })).toBeVisible();
    await expect(page.locator('.solution-ghost')).toHaveCount(0);
    await expect(page.locator('#fieldNotice')).toContainText(
      'Select a target ring to view its coaching notes.',
    );
    await expect(page.locator('#fieldNotice')).toHaveClass(/is-visible/);
    await expect(page.locator('#targetPanel')).toBeHidden();

    await page.locator('.tgt[data-id="P"]').click();
    await expect(page.locator('#targetPanelTitle')).toHaveText('Position Notes: P');
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
        contextBottom: contextRect.bottom,
        fieldTop: fieldRect.top,
      };
    });
    expect(notesLayout.parentClass).toContain('header-shell');
    expect(notesLayout.contextBottom).toBeLessThanOrEqual(notesLayout.fieldTop);

    await page.getByRole('button', { name: 'Close notes and review' }).click();
    await expect(page.locator('#contextBar')).toBeHidden();
    await page.locator('.tgt[data-id="P"]').click();
    await expect(page.locator('#contextBar')).toBeVisible();

    await page.getByRole('button', { name: 'Continue ▶' }).click();
    await expect(page.locator('#fieldNotice')).not.toHaveClass(/is-visible/);
    await expect(page.locator('#targetPanel')).toBeHidden();
    for (const position of ['LF', 'SS', '2B']) {
      const chip = page.locator('#wrap .chip').filter({ hasText: position });
      await expect(chip).toHaveCount(1);
      await chip.click();
    }
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
    await expect(page.locator('.seq-route-active')).toHaveCount(2);
    await expect(page.locator('.seq-route-underlay')).toHaveCount(2);
    await expect(page.locator('.seq-route-active').first()).toHaveCSS('stroke', 'rgb(89, 231, 255)');
    await expect(page.locator('#seqPanel')).toContainText('Play Review');
    const reviewDoesNotOverlap = await page.evaluate(() => {
      const contextRect = document.querySelector('#contextBar').getBoundingClientRect();
      const fieldRect = document.querySelector('#fieldImg').getBoundingClientRect();
      return contextRect.bottom <= fieldRect.top;
    });
    expect(reviewDoesNotOverlap).toBe(true);

    const routeLayout = await page.evaluate(() => {
      const ids = ['LF', 'SS', '2B'];
      const centers = Object.fromEntries(ids.map((id) => {
        const element = [...document.querySelectorAll('#wrap .chip')]
          .find((chip) => chip.childNodes[0]?.textContent?.trim() === id);
        return [id, {
          x: Number(element.style.left.replace('px', '')),
          y: Number(element.style.top.replace('px', '')),
          radius: element.getBoundingClientRect().width / 2,
          zIndex: Number(getComputedStyle(element).zIndex),
        }];
      }));
      const routes = [...document.querySelectorAll('.seq-route-active')].map((path, index) => {
        const points = path.getAttribute('d').replace(/[ML,]/g, ' ').trim().split(/\s+/).map(Number);
        const source = centers[ids[index]];
        const destination = centers[ids[index + 1]];
        return {
          sourceClearance: Math.hypot(points[0] - source.x, points[1] - source.y),
          destinationClearance: Math.hypot(points[2] - destination.x, points[3] - destination.y),
          sourceRadius: source.radius,
          destinationRadius: destination.radius,
        };
      });
      return {
        routes,
        routeZIndex: Number(getComputedStyle(document.querySelector('.throwTrail')).zIndex),
        chipZIndex: centers.LF.zIndex,
      };
    });
    expect(routeLayout.routeZIndex).toBeLessThan(routeLayout.chipZIndex);
    for (const route of routeLayout.routes) {
      expect(route.sourceClearance).toBeGreaterThan(route.sourceRadius);
      expect(route.destinationClearance).toBeGreaterThan(route.destinationRadius);
    }
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
