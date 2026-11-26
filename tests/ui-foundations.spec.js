import { test, expect } from '@playwright/test';

async function signIn(page, baseURL) {
  const response = await page.request.post('/api/auth/login', {
    headers: { Origin: new URL(baseURL).origin },
    data: { username: 'admin', password: 'password' },
  });
  expect(response.ok()).toBe(true);
}

test('Design sidebar retains keyboard navigation, themes and available content width',async({page,baseURL})=>{
 await signIn(page,baseURL);await page.setViewportSize({width:1040,height:768});await page.goto('/workspace/design');
 const workspace=page.locator('#designWorkspace'),nav=workspace.getByRole('navigation',{name:'Design sections'});
 const situations=nav.getByRole('button',{name:'Situations',exact:true});
 await expect(situations).toBeVisible();
 await expect(situations).toHaveAttribute('aria-current','page');
 await workspace.locator('.design-library-switcher summary').click();
 await expect(workspace.getByRole('searchbox',{name:'Find a library'})).toBeVisible();
 await workspace.getByRole('searchbox',{name:'Find a library'}).fill('Global');
 await workspace.locator('.design-library-results').getByRole('button',{name:/Global Library/}).click();
 // Library selection reloads its permission-dependent navigation asynchronously.
 const reviews=nav.getByRole('button',{name:'Publication reviews',exact:true});
 await expect(workspace.getByRole('region',{name:'Global Library',exact:true})).toBeVisible();
 await expect(reviews).toBeVisible();
 await situations.focus();await expect(situations).toBeFocused();
 await page.keyboard.press('Tab');
 await expect(reviews).toBeFocused();
 const manage=nav.getByRole('button',{name:'Manage library',exact:true});await manage.focus();await page.keyboard.press('Enter');
 await expect(manage).toHaveAttribute('aria-current','page');await expect(page).toHaveURL(/view=manage/);
 await expect(workspace.getByRole('navigation',{name:'Global Library tools'})).toBeVisible();
 await expect(situations).toBeVisible();
 await situations.click();
 for(const theme of ['classic-ballpark','cobalt-daylight','midnight']){
  await page.locator('html').evaluate((el,value)=>el.dataset.theme=value,theme);
  const colors=await workspace.locator('a.dd-button[data-variant="primary"]').evaluate(el=>{
   const probe=document.createElement('span');probe.style.backgroundColor='var(--accent-primary)';document.body.append(probe);
   const expected=getComputedStyle(probe).backgroundColor;probe.remove();return {actual:getComputedStyle(el).backgroundColor,expected};
  });expect(colors.actual).toBe(colors.expected);
 }
 for(const width of [1040,1440,2560]){
  await page.setViewportSize({width,height:900});
  const boxes=await workspace.evaluate(el=>({sidebar:el.querySelector('.design-sidebar').getBoundingClientRect().toJSON(),header:el.querySelector('.dd-page-header').getBoundingClientRect().toJSON(),content:el.querySelector('.workspace-frame').getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth-innerWidth}));
  expect(boxes.content.x).toBeGreaterThanOrEqual(boxes.sidebar.right-1);expect(boxes.content.right).toBeLessThanOrEqual(width+1);
  expect(Math.abs(boxes.header.width-boxes.content.width)).toBeLessThan(2);expect(boxes.content.width).toBeGreaterThan(width-300);expect(boxes.overflow).toBeLessThanOrEqual(1);
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
  await page.locator('#fieldNavigationButton').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#appHeader')).toHaveAttribute('data-foundation-marker', 'mounted');
  await expect(page.locator('#fieldImg')).toBeVisible();
});
