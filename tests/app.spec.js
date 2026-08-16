import { test, expect } from '@playwright/test';

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
  await page.getByRole('button', { name: 'Player Login' }).click();
  await page.locator('#playerTeamSelect').selectOption('13u-black');
  await page.locator('#playerNameSelect').selectOption('13u-black-bob-smith-11');
  await page.locator('#playerPass').fill('1234');
  const successfulLoginDialog = page.waitForEvent('dialog');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  const dialog = await successfulLoginDialog;
  expect(dialog.message()).toBe('Logged in.');
  await dialog.dismiss();
  await expect(page.getByRole('button', { name: 'Player Info' })).toBeVisible();
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
      .poll(() => page.locator('#sitSelect option').count())
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

    expect(await page.locator('#sitSelect option').count()).toBeGreaterThanOrEqual(22);
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

    const values = await page.locator('#sitSelect option').evaluateAll((options) =>
      options.map((option) => option.value),
    );
    expect(values).toContain('BD-01');
    expect(values).toContain('BD-20');

    await page.locator('#sitSelect').selectOption('BD-02');
    await expect(page.locator('#sitSelect')).toHaveValue('BD-02');
    await expect(page.locator('#descHud')).not.toHaveText('');
    await expect(page.locator('#outsVal')).toHaveText(/^[0-2]$/);
  });

  test('modern strategy-board shell keeps controls organized and help accessible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openCleanApp(page);

    await expect(page.getByRole('heading', { name: 'Diamond Defense' })).toBeVisible();
    await expect(page.locator('.situation-controls')).toBeVisible();
    await expect(page.locator('.game-controls')).toBeVisible();
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
    await page.getByRole('button', { name: 'Close Guide' }).click();
    await expect(page.locator('.playbook-rail')).not.toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
    await page.evaluate(() => window.__DIQ_READY__);
    await expect(page.getByRole('button', { name: 'Player Login' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guide' })).toBeVisible();
    await page.locator('.tools-menu summary').click();
    await expect(page.getByRole('button', { name: 'Coach Tools' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Admin' })).toBeVisible();
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

  test('player login rejects a wrong password and accepts a roster password', async ({ page }) => {
    await openCleanApp(page);

    await page.getByRole('button', { name: 'Player Login' }).click();
    await page.locator('#playerTeamSelect').selectOption('13u-black');
    await page.locator('#playerNameSelect').selectOption('13u-black-bob-smith-11');

    await page.locator('#playerPass').fill('wrong-password');
    const wrongPasswordDialog = page.waitForEvent('dialog');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    const rejectedLogin = await wrongPasswordDialog;
    expect(rejectedLogin.message()).toBe('Incorrect password.');
    await rejectedLogin.dismiss();
    await expect(page.locator('#playerLoginStatus')).toHaveText('Not logged in');

    await page.locator('#playerPass').fill('1234');
    const successfulLoginDialog = page.waitForEvent('dialog');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    const acceptedLogin = await successfulLoginDialog;
    expect(acceptedLogin.message()).toBe('Logged in.');
    await acceptedLogin.dismiss();

    await expect(page.locator('#playerLoginStatus')).toContainText('#11 Bob Smith');
    await expect(page.locator('#playerIdText')).toHaveText('13u-black-bob-smith-11');
    await expect(page.getByRole('button', { name: 'Player Info' })).toBeVisible();
  });

  test('coach and admin tools enforce their current password gates', async ({ page }) => {
    await openCleanApp(page);

    await page.locator('.tools-menu summary').click();
    await page.getByRole('button', { name: 'Coach Tools' }).click();
    await expect(page.locator('#pwModal')).toBeVisible();
    await page.locator('#pwInput').fill('wrong');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.locator('#pwMsg')).toHaveText('Incorrect password.');
    await page.locator('#pwInput').fill('coach');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.locator('#coachCard')).toBeVisible();
    await expect(page.locator('#coachStatus')).toHaveText('unlocked');
    const coachDrawerLayout = await page.evaluate(() => {
      const drawer = document.querySelector('#toolsDrawer');
      const rect = drawer.getBoundingClientRect();
      return {
        parentId: document.querySelector('#coachCard').parentElement.id,
        position: getComputedStyle(drawer).position,
        rightGap: window.innerWidth - rect.right,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
      };
    });
    expect(coachDrawerLayout.parentId).toBe('toolsDrawer');
    expect(coachDrawerLayout.position).toBe('fixed');
    expect(coachDrawerLayout.rightGap).toBeLessThanOrEqual(12);
    expect(coachDrawerLayout.bottom).toBeLessThanOrEqual(coachDrawerLayout.viewportHeight);

    await page.locator('.tools-menu summary').click();
    await page.getByRole('button', { name: 'Admin' }).click();
    await expect(page.locator('#adminPwModal')).toBeVisible();
    await page.locator('#adminPwInput').fill('wrong');
    await page.locator('#adminPwOk').click();
    await expect(page.locator('#adminPwMsg')).toHaveText('Incorrect password.');
    await page.locator('#adminPwInput').fill('admin');
    await page.locator('#adminPwOk').click();
    await expect(page.locator('#adminCard')).toBeVisible();
    await expect(page.locator('#adminStatus')).toHaveText('unlocked');
    await expect(page.locator('#coachCard')).toBeHidden();
    expect(await page.locator('#adminCard').evaluate((card) => card.parentElement.id)).toBe('toolsDrawer');

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

    await page.locator('.tools-menu summary').click();
    await page.getByRole('button', { name: 'Coach Tools' }).click();
    await page.locator('#pwInput').fill('coach');
    await page.getByRole('button', { name: 'Unlock' }).click();

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
    await page.locator('.tools-menu summary').click();
    await page.getByRole('button', { name: 'Admin' }).click();
    await page.locator('#adminPwInput').fill('admin');
    await page.locator('#adminPwOk').click();
    await expect(page.locator('#adminCard')).toBeVisible();

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const teamName = `Browser Admin ${suffix}`;
    const teamId = teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await page.locator('#adminTeamName').fill(teamName);
    await page.locator('#adminTeamEmail').fill('browser-admin@example.com');
    const createResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/admin/teams') && response.request().method() === 'POST',
    );
    await page.locator('#adminTeamAddBtn').click();
    const created = (await (await createResponse).json()).record;
    expect(created).toEqual(expect.objectContaining({ id: teamId, revision: 1 }));

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

    const cleanupStatus = await page.evaluate(async ({ id, revision }) => {
      const response = await fetch(`./api/admin/teams/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'If-Match': String(revision) },
      });
      return response.status;
    }, { id: teamId, revision: updated.revision });
    expect(cleanupStatus).toBe(200);
  });

  test('current pure helpers retain their established output', async ({ page }) => {
    await openCleanApp(page);

    const output = await page.evaluate(() => ({
      slug: slugify(' 13U Black / Smith '),
      looseSlug: slugifyLoose(`Coach's Team`),
      clampedLow: clampInt(-4, 0, 2),
      clampedHigh: clampInt(9, 0, 2),
      filename: safeSituationJsonFilename('Double / Cut: Play?'),
    }));

    expect(output).toEqual({
      slug: '13u-black-smith',
      looseSlug: 'coachs-team',
      clampedLow: 0,
      clampedHigh: 2,
      filename: 'Double Cut Play.json',
    });
  });

  test('situation normalization and export retain all current situations', async ({ page }) => {
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
      const exported = JSON.parse(buildAllSituationsExport());

      return {
        normalized: {
          key: normalized.key,
          outs: normalized.outs,
          runnersOn: normalized.runnersOn,
          hitType: normalized.hitType,
          hit: normalized.hit,
        },
        exportCount: exported.length,
        exportKeys: exported.map((situation) => situation.key),
      };
    });

    expect(result.normalized).toEqual({
      key: 'NORMALIZE-01',
      outs: 2,
      runnersOn: { first: true, second: false, third: true },
      hitType: 'line',
      hit: { x: 1600, y: 533 },
    });
    expect(result.exportCount).toBeGreaterThanOrEqual(22);
    expect(new Set(result.exportKeys).size).toBe(result.exportCount);
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

  test('coach review codes round-trip without losing report data', async ({ page }) => {
    await openCleanApp(page);

    const result = await page.evaluate(() => {
      const payload = {
        v: 1,
        dayKey: '2026-08-02',
        team: { id: '13u-black', name: '13U Black' },
        player: { id: 'p-1', name: 'Test Player', number: '99' },
        attempts: [{ situationKey: 'BD-01', posResult: 'SUCCESS' }],
      };
      const code = encodeCoachReviewCode(payload);
      return { code, decoded: decodeCoachReviewCode(code) };
    });

    expect(result.code).toMatch(/^DIQ1:/);
    expect(result.decoded).toEqual({
      v: 1,
      dayKey: '2026-08-02',
      team: { id: '13u-black', name: '13U Black' },
      player: { id: 'p-1', name: 'Test Player', number: '99' },
      attempts: [{ situationKey: 'BD-01', posResult: 'SUCCESS' }],
    });
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
    await expect(page.getByRole('button', { name: 'Continue ▶' })).toBeVisible();
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
    await page.getByRole('button', { name: 'Verify Sequence' }).click();

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

    const marker = `Regression Test ${Date.now()}`;
    const countBefore = await page.evaluate(() => RESULTS.log.length);
    const savedResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/attempts') && response.request().method() === 'POST',
    );

    const saved = await page.evaluate((situationTitle) => {
      recordAttempt({
        phase: 1,
        situationKey: 'BD-01',
        situationTitle,
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
      expect.objectContaining({ situationTitle: marker }),
    ]));
    expect(saved.summary.attempts).toBeGreaterThanOrEqual(1);
    expect(saved.summary.bestPhase1.score).toBeGreaterThanOrEqual(7);
    expect(saved.summary.bestPhase1.total).toBe(9);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
    await page.evaluate(() => window.__DIQ_READY__);
    const restored = await page.evaluate((situationTitle) => ({
      attempts: RESULTS.bySituation['BD-01']?.attempts,
      hasMarker: RESULTS.log.some((entry) => entry.situationTitle === situationTitle),
    }), marker);
    expect(restored.attempts).toBeGreaterThanOrEqual(1);
    expect(restored.hasMarker).toBe(true);
  });
});
