import { test, expect } from '@playwright/test';

async function signIn(page, baseURL) {
  const response = await page.request.post('/api/auth/login', {
    headers: { Origin: new URL(baseURL).origin },
    data: { username: 'admin', password: 'password' },
  });
  expect(response.ok()).toBe(true);
}

test('shared workspace components retain keyboard navigation, themes and full-width content', async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await page.setViewportSize({ width: 1040, height: 768 });
  await page.goto('/workspace/design');
  const workspace = page.locator('#designWorkspace');
  await expect(workspace.getByRole('heading', { name: 'Design', exact: true })).toBeVisible();
  await expect(workspace.getByRole('region', { name: 'Global Library', exact: true })).toBeVisible();
  const selector = workspace.getByLabel('Library', { exact: true });
  await expect(selector).toHaveCSS('min-height', '40px');
  const navigation = workspace.getByRole('navigation', { name: 'Design sections' });
  const library = navigation.getByRole('button', { name: 'Global Library', exact: true });
  await expect(library).toHaveAttribute('aria-pressed', 'true');
  await library.focus();
  await page.keyboard.press('Tab');
  await expect(navigation.getByRole('button', { name: 'Publication reviews', exact: true })).toBeFocused();
  const manage = navigation.getByRole('button', { name: 'Manage library', exact: true });
  await manage.focus();
  await page.keyboard.press('Enter');
  await expect(manage).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/view=manage/);
  await expect(workspace.getByRole('navigation', { name: 'Global Library tools' })).toBeVisible();
  await library.click();

  for (const theme of ['classic-ballpark', 'cobalt-daylight', 'midnight']) {
    await page.locator('html').evaluate((element, value) => element.dataset.theme = value, theme);
    await expect.poll(async () => {
      const colors = await workspace.locator('a.dd-button[data-variant="primary"]').evaluate(element => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement('span');
      probe.style.backgroundColor = root.getPropertyValue('--accent-primary');
      document.body.append(probe);
      const expected = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { actual: getComputedStyle(element).backgroundColor, expected };
    });
      return colors.actual === colors.expected;
    }).toBe(true);
  }
  await page.locator('html').evaluate(element => element.dataset.theme = 'classic-ballpark');
  for (const width of [1040, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await workspace.evaluate(element => {
      const header = element.querySelector('.dd-page-header');
      const content = element.querySelector('.workspace-frame');
      return { header: header.getBoundingClientRect().width, content: content.getBoundingClientRect().width,
        overflowing: document.documentElement.scrollWidth > innerWidth };
    });
    expect(geometry.header).toBeGreaterThan(width * .9);
    expect(Math.abs(geometry.header - geometry.content)).toBeLessThan(2);
    expect(geometry.overflowing).toBe(false);
  }
});

test('library failures use persistent error feedback and recover without losing navigation', async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await page.route('**/api/design?*', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Library temporarily unavailable.' }),
  }));
  await page.goto('/workspace/design');
  await expect(page.locator('#designWorkspace .dd-feedback[role="alert"]')).toHaveText('Library temporarily unavailable.');
  await expect(page.getByRole('heading', { name: 'Design', exact: true })).toBeVisible();
  await page.unroute('**/api/design?*');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Global Library', exact: true })).toBeVisible();
  await expect(page.locator('#designWorkspace .dd-feedback')).toHaveAttribute('data-empty', 'true');
  await page.locator('#appHeader').evaluate(element => element.dataset.foundationMarker = 'mounted');
  await page.getByRole('button', { name: 'Back to Play', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#appHeader')).toHaveAttribute('data-foundation-marker', 'mounted');
  await expect(page.locator('#fieldImg')).toBeVisible();
});
