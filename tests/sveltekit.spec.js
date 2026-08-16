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

  test('does not expose seed JSON as a runtime data source', async ({ request }) => {
    expect((await request.get('/situations.json')).status()).toBe(404);
    expect((await request.get('/teams.json')).status()).toBe(404);
  });
});
