import { expect, test } from '@playwright/test';

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

async function loginAsPlayer(page) {
  await page.locator('#signInUsername').fill('bob.smith');
  await page.locator('#signInPassword').fill('password');
  await page.locator('#signInPassword').press('Enter');
  await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('#11 Bob Smith');
}

async function loginAsCoach(page) {
  await page.locator('#signInUsername').fill('jamie.rivera');
  await page.locator('#signInPassword').fill('password');
  await page.locator('#signInPassword').press('Enter');
  await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('Jamie Rivera');
}

test.describe('release readiness', () => {
  test('public and login surfaces remain responsive and keyboard accessible', async ({ page }) => {
    const pageErrors = await openCleanApp(page);
    await expect(page.locator('#fieldImg')).toHaveAttribute(
      'alt',
      'Diamond Defence baseball strategy field',
    );

    const publicLayout = await page.evaluate(() => ({
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      bodyOverflow: document.body.scrollWidth - window.innerWidth,
    }));
    expect(publicLayout.documentOverflow).toBeLessThanOrEqual(1);
    expect(publicLayout.bodyOverflow).toBeLessThanOrEqual(1);

    // The signed-out entry opens Login automatically. Preserve its keyboard focus.
    await expect(page.locator('#signInUsername')).toBeFocused();
    const dialog = page.locator('#playerModalOverlay');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.getByRole('tab')).toHaveCount(0);
    await expect(dialog.getByLabel('Username')).toBeFocused();

    const modalAudit = await dialog.evaluate((overlay) => {
      const visibleControls = [...overlay.querySelectorAll('button, input, select, textarea')]
        .filter((control) => control.getClientRects().length > 0);
      const unnamedControls = visibleControls.filter((control) => {
        const labelledBy = control.getAttribute('aria-labelledby');
        const labelledByText = labelledBy
          ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ')
          : '';
        return ![
          control.getAttribute('aria-label'),
          labelledByText,
          [...(control.labels || [])].map((label) => label.textContent || '').join(' '),
          control.textContent,
          control.getAttribute('title'),
        ].some((value) => String(value || '').trim());
      });
      const panel = overlay.querySelector('.modalPanel');
      const rect = panel.getBoundingClientRect();
      return {
        unnamedControls: unnamedControls.map((control) => control.id || control.tagName),
        left: rect.left,
        right: rect.right,
        viewportWidth: window.innerWidth,
        horizontalOverflow: panel.scrollWidth - panel.clientWidth,
      };
    });
    expect(modalAudit.unnamedControls).toEqual([]);
    expect(modalAudit.left).toBeGreaterThanOrEqual(-1);
    expect(modalAudit.right).toBeLessThanOrEqual(modalAudit.viewportWidth + 1);
    expect(modalAudit.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(pageErrors).toEqual([]);
  });

  test('player sessions resume, log out, and cannot cross role boundaries', async ({ page }) => {
    await openCleanApp(page);
    await loginAsPlayer(page);

    const permissions = await page.evaluate(async () => ({
      ownResults: (await fetch('/api/results/me')).status,
      teamReport: (await fetch('/api/reports/team/13u-black')).status,
      administration: (await fetch('/api/admin/teams')).status,
    }));
    expect(permissions).toEqual({ ownResults: 200, teamReport: 403, administration: 403 });

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
    await page.evaluate(() => window.__DIQ_READY__);
    await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('#11 Bob Smith');
    await page.locator('#playerBtn').click();
    await Promise.all([page.waitForEvent('load'),page.locator('#accountLogoutBtn').click()]);
    await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('Login');
    await expect(page.locator('#signInUsername')).toBeFocused();
    expect((await page.request.get('/api/results/me')).status()).toBe(401);
  });

  test('coach reports load while administrator routes remain protected', async ({ page }) => {
    await openCleanApp(page);
    await loginAsCoach(page);

    const permissions = await page.evaluate(async () => ({
      ownTeamReport: (await fetch('/api/reports/team/13u-black')).status,
      administration: (await fetch('/api/admin/teams')).status,
    }));
    expect(permissions).toEqual({ ownTeamReport: 200, administration: 403 });

    await page.locator('#staffToolsBtn').click();
    await expect(page.locator('#trainingDashboard')).toBeVisible();
    const attempts=page.locator('[data-training-section="attempts"]');
    if(!await attempts.isVisible())await page.getByRole('button',{name:'Sections',exact:true}).click();
    await attempts.click();
    await expect(page.locator('#coachResultsWorkspace')).toBeVisible();
    await expect(page.locator('#coachDevelopmentInsights')).toBeVisible();
    await page.locator('#coachMoreFilters').click();
    await expect(page.locator('#coachPlayerPicker')).toBeVisible();
    await page.locator('#coachPlayerPicker > summary').click();
    await expect(page.locator('#coachPlayerChoices')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#coachPlayerPicker')).not.toHaveAttribute('open', '');
  });

  test('unsupported screens receive a clear non-interactive boundary', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
    await page.evaluate(() => window.__DIQ_READY__);
    await expect(page.locator('#screenSizeGate')).toBeVisible();
    await expect(page.locator('#screenSizeGateTitle')).toHaveText(
      'Open Diamond Defence on a tablet or computer',
    );
    await expect(page.locator('#fieldImg')).toBeHidden();
  });
});
