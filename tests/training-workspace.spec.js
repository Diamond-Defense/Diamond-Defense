import { test, expect } from '@playwright/test';

async function signIn(page, baseURL, username = 'jamie.rivera') {
  const response = await page.request.post('/api/auth/login', {
    headers: { Origin: new URL(baseURL).origin },
    data: { username, password: 'password' },
  });
  expect(response.ok()).toBe(true);
}
async function ready(page, url) {
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute('data-diq-runtime', 'loaded');
  await page.evaluate(() => window.__DIQ_READY__);
}

test('training dashboard uses authorized team data and rejects player access', async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  const response = await page.request.get('/api/training/13u-black/dashboard?days=7');
  expect(response.ok(), await response.text()).toBe(true);
  const data = await response.json();
  expect(data.days).toBe(7);
  expect(Array.isArray(data.players)).toBe(true);
  expect(Array.isArray(data.recentAttempts)).toBe(true);
  expect(data.activePracticeCount).toBeGreaterThanOrEqual(data.activePractices.length);
  expect((await page.request.get('/api/training/outside-coach-scope/dashboard')).status()).toBe(403);
  await signIn(page, baseURL, 'bob.smith');
  expect((await page.request.get('/api/training/13u-black/dashboard')).status()).toBe(403);
});

test('training sections and practice filters survive reload and browser navigation', async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await ready(page, '/workspace/training');
  await expect(page.locator('#trainingDashboard')).toBeVisible();
  await page.locator('[data-training-section="practices"]').click();
  await page.locator('[data-practice-view="draft"]').click();
  await expect(page).toHaveURL(/section=practices.*view=draft/);
  await page.reload();
  await page.evaluate(() => window.__DIQ_READY__);
  await expect(page.locator('#practiceWorkspace')).toBeVisible();
  await expect(page.locator('[data-practice-view="draft"]')).toHaveAttribute('aria-selected', 'true');
  await page.locator('[data-training-section="players"]').click();
  await expect(page.locator('#trainingPlayers')).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-training-section="practices"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-practice-view="draft"]')).toHaveAttribute('aria-selected', 'true');
  await page.goForward();
  await expect(page.locator('#trainingPlayers')).toBeVisible();
  await page.locator('[data-training-section="overview"]').click();
  await page.locator('#trainingDateRange').selectOption('30');
  await page.reload();
  await page.evaluate(() => window.__DIQ_READY__);
  await expect(page.locator('#trainingDateRange')).toHaveValue('30');
});

test('practice builder remains available and field has no training sidebar', async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await ready(page, '/workspace/training?section=practices&team=13u-black&view=draft');
  await page.locator('#practiceNewAssignment').click();
  await expect(page.locator('#practiceAssignmentForm')).toBeVisible();
  await page.locator('#practiceTitle').fill('Unsaved practice');
  await page.locator('[data-training-section="overview"]').click();
  await page.locator('[data-training-section="practices"]').click();
  await expect(page.locator('#practiceTitle')).toHaveValue('Unsaved practice');
  await page.locator('#practiceBuilderBack').click();
  await expect(page.locator('#coachPracticeList')).toBeVisible();
  await page.locator('#fieldNavigationButton').click();
  await expect(page.locator('#trainingSidebar')).toBeHidden();
  await expect(page.locator('.field-card')).toBeVisible();
});

test('overview limits previews and exposes clear review and navigation actions', async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  const now = new Date();
  const dueAt = new Date(now.getTime() + 86400000).toISOString();
  await page.route('**/api/training/13u-black/dashboard?*', route => route.fulfill({json:{
    updatedAt:now.toISOString(),players:[],activePracticeCount:9,
    activePractices:Array.from({length:5},(_,i)=>({id:`practice-${i}`,title:`Practice ${i}`,dueAt,recipientCount:3,completedRecipientCount:0})),
    coachingFocus:Array.from({length:6},(_,i)=>({situationKey:`focus-${i}`,situationTitle:`Focus ${i}`,failed:3,failedPlayers:2,unfinished:1})),
    insights:{attentionSituations:[]},
    recentAttempts:Array.from({length:6},(_,i)=>({playerName:'Bob Smith',playerNumber:'11',situationTitle:`Situation ${i}`,outcome:i===0?'abandoned':'failed',createdAt:now.toISOString()})),
  }}));
  await ready(page,'/workspace/training?section=overview&team=13u-black');
  const dashboard=page.locator('#trainingDashboard');
  await expect(dashboard.locator('.training-priority-list li')).toHaveCount(3);
  await expect(dashboard.locator('.training-practice-progress .training-completion-item')).toHaveCount(3);
  await expect(dashboard.locator('.training-recent tbody tr')).toHaveCount(3);
  await expect(dashboard.getByRole('button',{name:'Refresh activity',exact:true})).toBeVisible();
  await expect(dashboard.locator('.training-recent tbody tr').first()).toContainText('Not finished');
  await expect(dashboard.locator('.training-recent .training-result svg')).toHaveCount(3);
  await expect(dashboard.locator('.training-recent .dd-status')).toHaveCount(0);
  await expect(dashboard.locator('.training-coaching-focus')).not.toContainText('Practice 0');
  await expect(dashboard.locator('.training-coaching-focus')).not.toContainText('unfinished');
  await expect(dashboard.locator('.training-coaching-focus')).toContainText('2 players may need help');
  await expect(dashboard.locator('table')).toHaveCount(1);
  await expect(dashboard.locator('.training-priority-rank')).toHaveText(['1','2','3']);
  await expect(dashboard.locator('.training-practice-progress [role=progressbar]')).toHaveCount(3);
  await expect(dashboard.locator('.training-practice-progress [role=progressbar]').first()).toHaveAttribute('aria-valuenow','0');
  await expect(dashboard.locator('.training-practice-progress [role=progressbar]').first()).toHaveAttribute('aria-valuemax','3');
  await expect(dashboard.locator('.training-recent .training-row-title').first()).toBeVisible();
  await expect(dashboard.locator('.training-recent .training-clickable-row')).toHaveCount(3);
  await expect(dashboard.locator('.training-recent thead')).not.toContainText('Action');
  await expect(dashboard.getByRole('button',{name:'View all (9)'})).toBeVisible();
  await dashboard.locator('.training-recent').getByRole('button',{name:'View all',exact:true}).click();
  await expect(page.locator('[data-training-section="attempts"]')).toHaveAttribute('aria-current','page');
});


test('Players filters, completion rings and player summary navigation work together',async({page,baseURL})=>{
  await signIn(page,baseURL);
  await page.route('**/api/training/13u-black/dashboard?*',route=>route.fulfill({json:{
    updatedAt:new Date().toISOString(),activePractices:[],activePracticeCount:0,coachingFocus:[],recentAttempts:[],
    players:[{id:'13u-black-bob-smith-11',name:'Bob Smith',number:'11',completed:1,pending:3,overdue:1,attempts:4,completedPlays:2,positioningAccuracy:50,lastActivity:new Date().toISOString()},
      {id:'inactive-fixture',name:'Inactive Player',number:'99',completed:0,pending:2,overdue:0,attempts:0,completedPlays:0,positioningAccuracy:null,lastActivity:null}],
  }}));
  await ready(page,'/workspace/training?section=players&team=13u-black');
  const players=page.locator('#trainingPlayers');
  await expect(players.locator('tbody tr')).toHaveCount(2);
  await expect(players.locator('tbody tr').first()).toContainText('1 of 4 complete');
  await players.locator('#trainingPlayerView').selectOption('inactive');
  await expect(players.locator('tbody tr')).toHaveCount(1);
  await expect(players.locator('tbody')).toContainText('No recent activity');
  await players.locator('#trainingPlayerView').selectOption('all');
  await players.locator('#trainingPlayerSearch').fill('11');
  await expect(players.locator('tbody tr')).toHaveCount(1);
  await players.getByRole('button',{name:'Review #11 Bob Smith',exact:true}).click();
  await expect(page.locator('#coachReviewOverview')).toBeVisible();
  await page.locator('#trainingBackToPlayers').click();
  await expect(players).toBeVisible();
  await expect(players.locator('#trainingPlayerSearch')).toHaveValue('11');
});
