import { test, expect } from '@playwright/test';

test.describe('SvelteKit application boundary', () => {
  test('serves the application metadata and compatibility runtime', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Diamond Defense');
    await expect(page.locator('meta[name="description"]').first()).toHaveAttribute(
      'content',
      'Diamond Defense is a baseball situation simulator and interactive playbook trainer for players and coaches.',
    );
    await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
    await expect(page.locator('script[data-diq-runtime="legacy-compatibility"]')).toHaveCount(3);
  });

  test('serves situations and teams through application routes', async ({ request }) => {
    const situationsResponse = await request.get('/situations.json');
    const teamsResponse = await request.get('/teams.json');

    expect(situationsResponse.ok()).toBe(true);
    expect(teamsResponse.ok()).toBe(true);
    expect(await situationsResponse.json()).toHaveLength(22);
    expect((await teamsResponse.json()).teams).toHaveLength(2);
  });
});
