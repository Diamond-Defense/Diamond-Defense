import { test, expect } from '@playwright/test';
async function login(page,baseURL){
 const response=await page.request.post('/api/auth/login',{headers:{Origin:new URL(baseURL).origin},data:{username:'bob.smith',password:'password'}});
 expect(response.ok()).toBe(true);
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-diq-runtime','loaded');
 await page.evaluate(()=>window.__DIQ_READY__);
}
test('top navigation and field fit desktop and tablet without changing field proportions',async({page,baseURL})=>{
 await login(page,baseURL);
 await expect(page.locator('#fieldTeamContext')).toHaveCount(0);
 await expect(page.locator('#fieldToolbar #playerPracticeContext')).toHaveCount(1);
 await expect(page.locator('#fieldPracticeLabel')).toBeVisible();
 for(const viewport of [{width:1440,height:900},{width:1366,height:768},{width:1280,height:720},{width:1100,height:900},{width:1024,height:768}]){
  await page.setViewportSize(viewport);
  await expect(page.locator('#fieldToolbar #playbookBrowserToggle')).toBeVisible();
  await expect(page.locator('#trainingNavigation #fieldNavigationButton')).toBeVisible();
  await expect(page.locator('#playerSituationDifficulty')).not.toBeEmpty();
  const g=await page.evaluate(()=>{const r=id=>{const b=document.getElementById(id).getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}};return {field:r('fieldImg'),panel:r('trainingPanel'),header:r('appHeader'),toolbar:r('fieldToolbar'),floating:document.getElementById('fieldToolbar').classList.contains('is-floating'),width:document.documentElement.scrollWidth};});
  expect(g.field.width/g.field.height).toBeCloseTo(3200/2133,3);
  expect(g.field.width).toBeGreaterThan(viewport.width*.60);
  expect(g.field.right).toBeLessThanOrEqual(g.panel.left);
  expect(g.field.bottom).toBeLessThanOrEqual(viewport.height+1);
  expect(g.floating).toBe(true);
  await expect(page.locator('.training-board>#fieldToolbar')).toBeVisible();
  await expect(page.locator('#trainingPanel #fieldToolbar')).toHaveCount(0);
  expect(g.toolbar.right).toBeLessThanOrEqual(g.panel.left-8);
  expect(g.toolbar.top).toBeGreaterThanOrEqual(g.header.bottom);
  expect(g.toolbar.left).toBeGreaterThanOrEqual(0);
  expect(g.field.top).toBeGreaterThanOrEqual(g.header.bottom);
  expect(g.width).toBeLessThanOrEqual(viewport.width);
  await page.screenshot({path:`/private/tmp/newui2-main-${viewport.width}.png`});
 }
 await page.locator('#practiceToggle').click();await expect(page.locator('#practiceWorkspace')).toBeVisible();
 await page.locator('#fieldNavigationButton').click();await expect(page.locator('#practiceWorkspace')).toBeHidden();await expect(page.locator('#fieldImg')).toBeVisible();
});
test('Playbook retains metadata and returns keyboard focus to the moved trigger',async({page,baseURL})=>{
 await login(page,baseURL);const trigger=page.locator('#playbookBrowserToggle');await trigger.click();
 const dialog=page.getByRole('dialog',{name:'Playbook',exact:true});await expect(dialog).toBeVisible();
 await expect(dialog.locator('.playbook-card-metadata').first()).not.toBeEmpty();
 await expect(dialog.locator('.training-base-map').first().locator('i')).toHaveCount(3);
 await expect(page.locator('#appHeader')).toHaveJSProperty('inert',true);
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();
 await expect(page.locator('#appHeader')).toHaveJSProperty('inert',false);
});

test('long situation titles and variation badges do not overlap gameplay instructions',async({page,baseURL})=>{
 await login(page,baseURL);
 for(const viewport of [{width:1440,height:900},{width:1024,height:768}]){
  await page.setViewportSize(viewport);
  await page.evaluate(()=>{
   currentSituation.title='Line Drive to Right-Center — Bases Loaded';
   currentSituation.variationTagged=true;currentSituation.variationNumber=2;
   currentSituation.desc='Keep the full situation description readable while positioning all defenders.';
   currentSituation.runnersOn={first:true,second:true,third:true};
   currentSituation.revision=currentSituation.revision || 1;
   // Browser-only published fixture: keep its authoritative group aligned with
   // the long title, rather than accidentally testing a regrouped draft.
   SITUATIONS_ORIG_BY_KEY[currentSituation.key]=JSON.parse(JSON.stringify(currentSituation));
   window._diqRefreshPlayerPresentation();
  });
  await expect(page.locator('#playerSituationName')).toHaveText('Line Drive to Right-Center — Bases Loaded');
  await expect(page.locator('#playerSituationVariation')).toHaveText('Variation B');
  const geometry=await page.evaluate(()=>{
   const bounds=id=>document.getElementById(id).getBoundingClientRect();
   return {hudBottom:bounds('trainingHud').bottom,instructionTop:bounds('playerStepLabel').top,
    panelOverflow:document.getElementById('trainingPanel').scrollWidth>document.getElementById('trainingPanel').clientWidth};
  });
  expect(geometry.instructionTop).toBeGreaterThanOrEqual(geometry.hudBottom);
  expect(geometry.panelOverflow).toBe(false);
 }
});

test('final position check does not move Reset into the previous check target',async({page,baseURL})=>{
 await page.setViewportSize({width:1440,height:1000});
 await login(page,baseURL);
 await page.locator('#startBtn').click();
 const check=page.locator('#checkBtn');
 await expect(check).toBeEnabled();
 await check.click();await check.click();
 const checkBox=await check.boundingBox();
 const panelHeight=await page.locator('#trainingPanel').evaluate(el=>el.getBoundingClientRect().height);
 await check.click();
 await expect(page.locator('#triesVal')).toHaveText('0/3');
 const resetBox=await page.locator('#resetBtn').boundingBox();
 expect(resetBox.y).toBeGreaterThan(checkBox.y+checkBox.height);
 expect(await page.locator('#trainingPanel').evaluate(el=>el.getBoundingClientRect().height)).toBeCloseTo(panelHeight,0);
 await page.mouse.click(checkBox.x+checkBox.width/2,checkBox.y+checkBox.height/2);
 await expect(page.locator('#triesVal')).toHaveText('0/3');
});

test('gameplay footer remains visible while long situation notes scroll',async({page,baseURL})=>{
 await page.setViewportSize({width:1024,height:768});
 await login(page,baseURL);
 await page.evaluate(()=>{
  currentSituation.desc='Coaching context and detailed situation notes. '.repeat(100);
  window._diqRefreshPlayerPresentation();
 });
 await page.locator('#situationNotes summary').click();
 const footer=page.locator('#trainingPanelFooter');
 const before=await footer.boundingBox();
 expect(before.y+before.height).toBeLessThanOrEqual(768);
 await page.locator('#trainingPanelContent').evaluate(el=>el.scrollTop=el.scrollHeight);
 expect(await footer.boundingBox()).toEqual(before);
 await expect(page.locator('#startBtn')).toBeInViewport();
});

test('sliding navigation indicator follows destinations and stays put for Guide',async({page,baseURL})=>{
 await login(page,baseURL);
 const indicator=page.locator('.navigation-indicator');
 const aligned=async id=>page.evaluate(id=>{
  const indicator=document.querySelector('.navigation-indicator').getBoundingClientRect();
  const button=document.getElementById(id).getBoundingClientRect();
  return Math.abs(indicator.left-button.left)<1&&Math.abs(indicator.width-button.width)<1;
 },id);
 await expect(indicator).toBeVisible();
 await expect.poll(()=>aligned('fieldNavigationButton')).toBe(true);
 const header=await page.locator('#appHeader').boundingBox();
 await page.locator('#practiceToggle').click();
 await expect(page.locator('#practiceWorkspace')).toBeVisible();
 await expect(page.locator('#practiceToggle')).toHaveAttribute('aria-current','page');
 await expect.poll(()=>aligned('practiceToggle')).toBe(true);
 await page.locator('#playbookToggle').click();
 await expect(page.locator('#playbookToggle')).toHaveAttribute('aria-expanded','true');
 await expect.poll(()=>aligned('practiceToggle')).toBe(true);
 await page.getByRole('button',{name:'Close Guide',exact:true}).click();
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(indicator).toHaveCSS('transition-duration','0s');
 await page.locator('#fieldNavigationButton').click();
 await expect(page.locator('#practiceWorkspace')).toBeHidden();
 await expect.poll(()=>aligned('fieldNavigationButton')).toBe(true);
 const finalHeader=await page.locator('#appHeader').boundingBox();
 expect(finalHeader).toEqual(header);
});

test('Playbook scrolls a large admin catalog without overlapping cards',async({page,baseURL})=>{
 const response=await page.request.post('/api/auth/login',{headers:{Origin:new URL(baseURL).origin},data:{username:'admin',password:'password'}});
 expect(response.ok()).toBe(true);
 const catalog=await (await page.request.get('/api/situations')).json();
 const situations=Array.from({length:32},(_,index)=>({...catalog[index%catalog.length],
  key:`overflow-fixture-${index}`,title:`Long library situation ${index} — line drive to right-center`,
  desc:index%3===0?'Additional situation context that must remain inside this card.':''}));
 await page.route('**/api/situations',route=>route.fulfill({json:situations}));
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-diq-runtime','loaded');
 await page.evaluate(()=>window.__DIQ_READY__);
 await page.locator('#playbookBrowserToggle').click();
 const cards=page.locator('#playbookBrowserList .playbook-situation-card');
 await expect(cards).toHaveCount(32);
 const geometry=await page.locator('#playbookBrowserList').evaluate(list=>{
  const cards=[...list.querySelectorAll('.playbook-situation-card')];
  const boxes=cards.map(card=>card.getBoundingClientRect());
  return {
   scrolls:list.scrollHeight>list.clientHeight,
   contentsFit:cards.every((card,index)=>[...card.children].every(child=>{
    const box=child.getBoundingClientRect();
    return box.top>=boxes[index].top&&box.bottom<=boxes[index].bottom+1;
   })),
   rowsSeparate:boxes.every((box,index)=>boxes.slice(index+1).every(next=>
    Math.abs(next.top-box.top)<1||next.top>=box.bottom+1)),
  };
 });
 expect(geometry).toEqual({scrolls:true,contentsFit:true,rowsSeparate:true});
 await cards.last().scrollIntoViewIfNeeded();
 await expect(cards.last()).toBeInViewport();
});

test('floating field controls use the same layout for players coaches and admins',async({browser,baseURL})=>{
 let playerGeometry;
 for(const username of ['bob.smith','jamie.rivera','admin']){
  const context=await browser.newContext({baseURL,viewport:{width:1703,height:972}});
  try{
   const page=await context.newPage();
   expect((await page.request.post('/api/auth/login',{headers:{Origin:new URL(baseURL).origin},data:{username,password:'password'}})).ok()).toBe(true);
   await page.goto('/');
   await expect(page.locator('html')).toHaveAttribute('data-diq-runtime','loaded');
   await page.evaluate(()=>window.__DIQ_READY__);
   const toolbar=page.locator('.training-board>#fieldToolbar');
   await expect(toolbar).toHaveClass(/is-floating/);
   await expect(page.locator('#trainingPanelContent #fieldToolbar')).toHaveCount(0);
   const geometry=await page.evaluate(()=>{
    const bounds=id=>{const box=document.getElementById(id).getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height}};
    return {field:bounds('fieldImg'),panel:bounds('trainingPanel'),toolbar:bounds('fieldToolbar')};
   });
   if(!playerGeometry)playerGeometry=geometry;
   else expect(geometry).toEqual(playerGeometry);
   if(username!=='bob.smith'){
    await page.locator('#staffToolsBtn').click();
    await page.locator('#fieldNavigationButton').click();
    await expect(toolbar).toHaveClass(/is-floating/);
    await expect(toolbar.locator('#playbookBrowserToggle')).toBeVisible();
   }
  }finally{await context.close();}
 }
});

test('practice sidebar filters and pagination remain local to the practice page',async({page,baseURL})=>{
 await login(page,baseURL);
 await page.route('**/api/practice/assignments?*',route=>{
  const url=new URL(route.request().url());
  const completed=url.searchParams.get('view')==='completed';
  const pageNumber=Number(url.searchParams.get('page')||1);
  const total=completed?1:7;
  const number=completed?1:pageNumber===1?6:1;
  const assignments=Array.from({length:number},(_,index)=>({
   id:`practice-${completed?'done':pageNumber}-${index}`,title:completed?'Finished drill':`Assigned drill ${pageNumber}-${index}`,
   status:'active',instructions:'Focus on your cutoff position.',
   recipients:[{playerId:'13u-black-bob-smith-11',status:completed?'completed':'assigned'}],
   situations:[{situationKey:'BD-01',title:'Line Drive to LF',progressStatus:completed?'completed':'not_started'}],
  }));
  return route.fulfill({json:{assignments,total,page:pageNumber,totalPages:completed?1:2,hasPrevious:pageNumber>1,hasNext:!completed&&pageNumber===1,counts:{pending:7,completed:1}}});
 });
 await page.locator('#practiceToggle').click();
 const sidebar=page.locator('#playerPracticeView .dd-workspace-sidebar');
 const sections=page.getByRole('navigation',{name:'Practice sections'});
 await expect(sidebar).toBeVisible();
 await expect(sidebar.getByRole('heading',{name:'Practice',exact:true})).toBeVisible();
 await expect(sidebar.locator('.dd-workspace-meta')).toHaveCount(0);
 await expect(page.locator('#playerPracticePageTitle')).toHaveText('Assigned practice');
 await expect(page.locator('#playerPracticeList [role=progressbar]')).toHaveCount(0);
 await expect(page.locator('#playerPracticeList article')).toHaveCount(6);
 await page.locator('#playerPracticePagination').getByRole('button',{name:/Next/}).click();
 await expect(page.locator('#playerPracticePagination')).toContainText('Page 2 of 2');
 await sections.getByRole('button',{name:/Completed/}).click();
 await expect(page.locator('#playerPracticePageTitle')).toHaveText('Completed practice');
 await expect(page.locator('#playerPracticeList article')).toHaveCount(1);
 await expect(page.locator('#playerPracticeList')).toContainText('Finished drill');
 await expect(page.locator('#playerPracticeList [data-state=completed]')).toHaveCount(1);
 await expect(page.locator('#playerPracticeList [data-state=next]')).toHaveCount(0);
 await expect(page.locator('#playerPracticeList [data-practice-start]')).toHaveCount(0);
 await expect(page).toHaveURL(/\?practice=completed$/);
 await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-diq-runtime','loaded');
 await page.evaluate(()=>window.__DIQ_READY__);
 await expect(page.locator('#practiceWorkspace')).toBeVisible();
 await expect(page.locator('#playerPracticePageTitle')).toHaveText('Completed practice');
 await expect(page.locator('.field-card')).toBeHidden();
 await page.goBack();
 await expect(page.locator('#playerPracticePageTitle')).toHaveText('Assigned practice');
 await page.goForward();
 await expect(page.locator('#playerPracticePageTitle')).toHaveText('Completed practice');
 await sections.getByRole('button',{name:/To-do/}).click();
 await expect(page.locator('#playerPracticePagination')).toContainText('Page 1 of 2');
 await page.setViewportSize({width:1024,height:768});
 const toggle=sidebar.getByRole('button',{name:/Sections/});
 await expect(sections).toBeHidden();
 await toggle.click();
 await expect(sections).toBeVisible();
 await expect(toggle).toHaveAttribute('aria-expanded','true');
 await page.locator('#fieldNavigationButton').click();
 await expect(sidebar).toBeHidden();
 await expect(page).toHaveURL(new URL('/',baseURL).href);
});

test('practice deadline badges and header counts share urgency rules',async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,timezoneId:'America/New_York'});
 try{
  const page=await context.newPage();
  await login(page,baseURL);
  await page.clock.install({time:new Date('2026-11-22T17:00:00Z')});
  const cases=[
   ['Later','2026-11-25T23:59:59Z','neutral','Due Nov 25'],
   ['Two days','2026-11-24T23:59:59Z','soon','Due in 2 days'],
   ['Tomorrow','2026-11-23T23:59:59Z','soon','Due tomorrow'],
   ['Today','2026-11-22T23:59:59Z','soon','Due today'],
   ['Late','2026-11-21T23:59:59Z','overdue','Overdue · Nov 21'],
  ];
  let nextDueAt=cases[4][1],overdueCount=1;
  await page.route('**/api/practice/status',route=>route.fulfill({json:{pendingCount:5,overdueCount,nextDueAt,freePlayAllowed:false,lockedAssignment:null}}));
  await page.route('**/api/practice/assignments?*',route=>{
   const completed=new URL(route.request().url()).searchParams.get('view')==='completed';
   const rows=completed?[cases[4]]:cases;
   return route.fulfill({json:{assignments:rows.map(([title,dueAt])=>({id:title,title,dueAt,status:'active',overdue:title==='Late',
    recipients:[{playerId:'13u-black-bob-smith-11',status:completed?'completed':'assigned'}],
    situations:[{situationKey:'BD-01',title:'Line Drive to LF',progressStatus:completed?'completed':'not_started'}],
   })),counts:{pending:5,completed:1},page:1,total:rows.length,totalPages:1,hasNext:false,hasPrevious:false}});
  });
  await page.evaluate(()=>window._diqRefreshPracticeState());
  const count=page.locator('#practiceToggle .practice-toggle-count');
  await expect(count).toHaveAttribute('data-urgency','overdue');
  await expect(page.locator('#practiceToggle')).toHaveAttribute('aria-label',/overdue/i);
  await page.locator('#practiceToggle').click();
  for(const [title,,tone,label] of cases){
   const card=page.locator('#playerPracticeList article').filter({has:page.getByRole('heading',{name:title,exact:true})});
   const deadline=card.locator('time');
   await expect(deadline).toHaveText(label);
   await expect(deadline).toHaveAttribute('data-urgency',tone);
   await expect(deadline).toHaveAttribute('aria-label',/2026/);
   await expect(deadline.locator('svg')).toHaveAttribute('aria-hidden','true');
  }
  nextDueAt=cases[2][1];overdueCount=0;
  await page.evaluate(()=>window._diqRefreshPracticeState());
  await expect(count).toHaveAttribute('data-urgency','soon');
  await expect(page.locator('#practiceToggle')).toHaveAttribute('aria-label',/due tomorrow/i);
  nextDueAt=cases[0][1];
  await page.evaluate(()=>window._diqRefreshPracticeState());
  await expect(count).toHaveAttribute('data-urgency','neutral');
  await page.getByRole('navigation',{name:'Practice sections'}).getByRole('button',{name:/Completed/}).click();
  await expect(page.locator('#playerPracticePageTitle')).toHaveText('Completed practice');
  await expect(page.locator('#playerPracticeList time')).toHaveCount(1);
  await expect(page.locator('#playerPracticeList time')).toHaveAttribute('data-urgency','neutral');
  await expect(page.locator('#playerPracticeList time')).toHaveText('Due Nov 21');
 }finally{await context.close();}
});
