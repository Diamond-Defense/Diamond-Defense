import {openBattedBall,selectBoardStep} from './helpers/play-library.js';
import {openLibraryPlay} from './helpers/play-library.js';
import {test,expect} from '@playwright/test';
import {fromSituation} from '../src/lib/plays/board.js';
import {compilePlay} from '../src/lib/plays/animation.js';
test('Coach Board edits preserve structured details and publish the same Situation identity',async({page,baseURL})=>{
 test.setTimeout(30000);const headers={Origin:new URL(baseURL).origin};await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
 const source=(await (await page.request.get('/api/situations')).json())[0];
 const input={...source,key:`unified-${Date.now()}`,title:`Unified ${Date.now()}`,revision:undefined,displayCode:undefined,extension:{keep:'round-trip'}};
 input.playSeq2=['RF','2B'];
 const board=fromSituation(input),start=board.defenders.SS,middle={x:start.x+60,y:start.y-50};
 board.movements.SS=[{path:[start,middle],start:{event:'contact'}},{path:[middle,{x:middle.x+50,y:middle.y-40},{x:input.targets.SS.x+45,y:input.targets.SS.y}],start:{event:'ball_fielded'}}];
 board.steps=[{id:'contact',name:'Contact'},{id:'step-cover',name:'Cover'}];
 board.movements.SS[1].stepId='step-cover';
 board.movements.SS[1].start={event:'step'};
 input.boardAnimation={version:2,movements:board.movements,battedBall:board.battedBall,steps:board.steps};
 const created=await page.request.post('/api/situations',{headers,data:input});expect(created.status()).toBe(201);let record=(await created.json()).record;
 const count=(await (await page.request.get('/api/situations')).json()).length;
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto('/coach-board?edit=1');await openLibraryPlay(page,'situation',record.key,record.title);
  await page.getByLabel('Situation name').fill('Unsaved visual name');
  await expect(page.getByRole('button',{name:'Situation Details',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'New Board',exact:true})).toHaveCount(0);
  expect((await (await page.request.get('/api/situations')).json()).length).toBe(count);await page.getByLabel('Situation name').fill('Structured and visual draft');
  await expect(page.getByLabel('Situation name')).toHaveValue('Structured and visual draft');
  await page.getByRole('button',{name:'Play timeline',exact:true}).click();
  await selectBoardStep(page,'Contact');await expect(page.getByRole('button',{name:'SS · Movement 1',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back to Library',exact:true}).click();page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('dialog').getByRole('button',{name:'New Board',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Close Library'}).click();await expect(page.getByLabel('Situation name')).toHaveValue('Structured and visual draft');
  await page.getByRole('button',{name:'Save Situation Changes',exact:true}).click();await expect(page.getByRole('region',{name:'Playback controls'})).toHaveCount(0);await page.getByRole('button',{name:'Publish Situation',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Situation changes saved.');
  const records=await (await page.request.get('/api/situations')).json();expect(records.length).toBe(count);const saved=records.find(s=>s.key===record.key);expect(saved.revision).toBe(record.revision+1);expect(saved.displayCode).toBe(record.displayCode);expect(saved.title).toBe('Structured and visual draft');expect(saved.targets).toEqual(record.targets);expect(saved.extension).toEqual(record.extension);expect(saved.playSeq2).toEqual(record.playSeq2);expect(saved.boardAnimation.movements.SS).toEqual(record.boardAnimation.movements.SS);const play=compilePlay(fromSituation(saved));
  expect(play.tracks.find(track=>track.id==='SS'&&track.index===1).start).toBeGreaterThanOrEqual(play.ballDuration);
  await page.reload();
  await openLibraryPlay(page,'situation',saved.key,saved.title);
  await page.getByRole('button',{name:'Play timeline',exact:true}).click();
  await selectBoardStep(page,'Cover');
  await page.getByRole('button',{name:'SS · Movement 2',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Start movement',exact:true})).toHaveValue('step');record=saved;expect(errors).toEqual([]);
 }finally{await page.request.delete(`/api/situations/${record.key}`,{headers:{...headers,'If-Match':String(record.revision)}});}
});

test('legacy edits keep identity and stale revisions leave the unsaved draft intact',async({page,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});const source=(await (await page.request.get('/api/situations')).json()).find(s=>!s.boardAnimation);
 const created=await page.request.post('/api/situations',{headers,data:{...source,key:`legacy-unified-${Date.now()}`,title:`Legacy unified ${Date.now()}`,revision:undefined,displayCode:undefined}});expect(created.status()).toBe(201);let record=(await created.json()).record;
 try{
  await page.goto('/coach-board?edit=1');await openLibraryPlay(page,'situation',record.key,record.title);await page.getByLabel('Situation name').fill('My pending changes');
  const updated=await page.request.put(`/api/situations/${record.key}`,{headers:{...headers,'If-Match':String(record.revision)},data:{...record,desc:'Concurrent edit'}});expect(updated.ok()).toBeTruthy();record=(await updated.json()).record;
  await page.getByRole('button',{name:'Save Situation Changes',exact:true}).click();await page.getByRole('button',{name:'Publish Situation',exact:true}).click();await expect(page.getByRole('status')).toContainText('changed');await expect(page.getByLabel('Situation name')).toHaveValue('My pending changes');expect((await (await page.request.get('/api/situations')).json()).find(s=>s.key===record.key).title).toBe(record.title);
 }finally{await page.request.delete(`/api/situations/${record.key}`,{headers:{...headers,'If-Match':String(record.revision)}});}
});

test('coach visual changes submit for review and preserve animation on approval',async({page,request,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};await request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
 const source=(await (await request.get('/api/situations')).json())[0];const created=await request.post('/api/situations',{headers,data:{...source,key:`coach-unified-${Date.now()}`,title:`Coach unified ${Date.now()}`,revision:undefined,displayCode:undefined}});expect(created.status()).toBe(201);let record=(await created.json()).record;
 await page.request.post('/api/auth/login',{headers,data:{role:'coach',teamId:'13u-black',coachId:'staff-coach',password:'password'}});
 try{
  await page.goto('/coach-board?edit=1');await openLibraryPlay(page,'situation',record.key,record.title);await page.getByLabel('Situation name').fill('Coach visual proposal');
  await page.getByRole('button',{name:'Save Situation Changes',exact:true}).click();await expect(page.getByRole('button',{name:'Publish Situation',exact:true})).toHaveCount(0);await page.getByLabel('Proposal reason').fill('Demonstrates the defensive responsibilities.');await page.getByRole('button',{name:'Submit for Review',exact:true}).click();await expect(page.getByRole('status')).toContainText('Proposal submitted');
  const submission=(await (await page.request.get('/api/situation-submissions')).json()).submissions.find(s=>s.situationKey===record.key);expect(submission.submissionType).toBe('update');expect(submission.situation.boardAnimation.version).toBe(2);
  expect((await page.request.put(`/api/situations/${record.key}`,{headers:{...headers,'If-Match':String(record.revision)},data:submission.situation})).status()).toBe(403);
  const approved=await request.put(`/api/admin/situation-submissions/${submission.id}`,{headers,data:{decision:'approve',acceptedFields:['title','boardAnimation'],notes:'Approved'}});expect(approved.ok()).toBeTruthy();record=(await (await request.get('/api/situations')).json()).find(s=>s.key===record.key);expect(record.title).toBe('Coach visual proposal');expect(record.boardAnimation).toEqual(submission.situation.boardAnimation);
 }finally{await request.delete(`/api/situations/${record.key}`,{headers:{...headers,'If-Match':String(record.revision)}});}
});

test('a new Situation draft creates its first record only when published from Coach Board',async({page,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};const login=await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});const user=(await login.json()).user;
 const records=await (await page.request.get('/api/situations')).json(),source=records[0];const draft={...source,key:`new-draft-${Date.now()}`,title:`New draft ${Date.now()}`,revision:undefined,displayCode:undefined};
 await page.goto('/coach-board?edit=1');await page.evaluate(({draft,userId})=>sessionStorage.setItem('diq-situation-authoring-v1',JSON.stringify({version:1,userId,destination:'board',situation:draft,baseline:draft,createdAt:Date.now()})),{draft,userId:user.id});await page.reload();await expect(page.getByLabel('Situation name')).toHaveValue(draft.title);
 expect((await (await page.request.get('/api/situations')).json()).some(s=>s.key===draft.key)).toBe(false);
 await page.getByRole('button',{name:'Save Situation Changes',exact:true}).click();await page.getByRole('button',{name:'Publish Situation',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Situation created.');const saved=(await (await page.request.get('/api/situations')).json()).find(s=>s.key===draft.key);expect(saved.revision).toBe(1);await page.request.delete(`/api/situations/${saved.key}`,{headers:{...headers,'If-Match':'1'}});
});

test('Admin library opens the shared training stages and publishes a new situation', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__DIQ_READY__);
  await page.locator('#playerBtn').click();
  await page.locator('#authAdminTab').click();
  await page.locator('#adminPwInput').fill('password');
  await page.locator('#adminPwOk').click();
  await page.locator('#staffToolsBtn').click();
  await page.getByRole('button', { name: 'Situations', exact: true }).click();
  await page.locator('#situationLibrary').getByRole('button', { name: 'New situation', exact: true }).click();
  const stages = page.getByRole('navigation', { name: 'Editor tools' });
  await expect(stages.getByRole('button')).toHaveText(['Details','Play timeline','Review']);
  await expect(page.getByRole('button',{name:'+ Add Step',exact:true})).toBeVisible();
  const title = `Training stages ${Date.now()}`;
  await page.getByLabel('Situation name').fill(title);
  await stages.getByRole('button',{name:'Details',exact:true}).click();
  await page.getByLabel('Difficulty').selectOption('advanced');
  await stages.getByRole('button',{name:'Play timeline',exact:true}).click();
  await page.getByRole('combobox', { name: 'Outs', exact: true }).selectOption('1');
  await openBattedBall(page);
  await page.getByLabel('Batted-ball type').selectOption('fly_ball');
  await stages.getByRole('button', { name: 'Play timeline' }).click();
  await page.getByText('Scoring targets & expected throws',{exact:true}).click();
  await page.getByLabel('Target tolerance').fill('125');
  await page.getByRole('button', { name: '+ Add Step', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Before the pitch', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add pickoff throw', exact: true })).toHaveCount(0);
  await page.getByRole('button',{name:'Blank step',exact:true}).click();
  await page.getByRole('button',{name:'Rename',exact:true}).click();
  await page.getByRole('textbox',{name:'Step name'}).fill('Back up the relay');
  await page.getByRole('textbox',{name:'Step name'}).press('Enter');
  await expect(page.getByRole('region',{name:'Play steps'}).getByRole('button',{name:'Back up the relay'})).toBeVisible();
  await stages.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Preview opening hit' }).click();
  await expect(page.locator('.board-hit-path')).toBeVisible();
  await page.getByRole('button', { name: 'Stop preview' }).click();
  await page.getByLabel('I confirm these play and runner outcomes').check();
  await page.getByRole('button', { name: 'Publish Situation', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Situation created.');
  const situations = await (await page.request.get('/api/situations')).json();
  const saved=situations.find(record=>record.title===title);
  expect(saved).toMatchObject({
    outs: 1, difficulty: 'advanced', targets: { P: { tol: 125 } },
    boardAnimation: { battedBall: { type: 'fly_ball' },steps:expect.arrayContaining([expect.objectContaining({name:'Back up the relay'})]) },
  });
  await page.reload();
  await openLibraryPlay(page,'situation',saved.key,saved.title);
  await expect(page.getByRole('region',{name:'Play steps'}).getByRole('button',{name:'Back up the relay'})).toBeVisible();
});

test('Coach workspace opens the shared stages and submits edits as a proposal', async ({ page, baseURL }) => {
  const auth = await page.request.post('/api/auth/login', {
    headers: { Origin: new URL(baseURL).origin },
    data: { role: 'coach', teamId: '13u-black', coachId: 'staff-coach', password: 'password' },
  });
  expect(auth.ok()).toBe(true);
  await page.goto('/');
  await page.evaluate(() => window.__DIQ_READY__);
  await page.locator('#staffToolsBtn').click();
  await page.getByRole('button', { name: 'Situation Proposals', exact: true }).click();
  await page.locator('#situationLibrary').getByRole('button', { name: 'Propose changes', exact: true }).first().click();
  const stages = page.getByRole('navigation', { name: 'Editor tools' });
  await stages.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publish Situation' })).toHaveCount(0);
  await expect(page.getByLabel('Player context')).toHaveCount(0);
  await page.getByLabel('Proposal reason').fill('Clarifies the defensive teaching focus.');
  await page.getByLabel('I confirm these play and runner outcomes').check();
  await page.getByRole('button', { name: 'Submit for Review', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Proposal submitted');
});

test('Review uses player opening hit and Watch Solution, returning the unpublished draft intact',async({page,baseURL})=>{
  test.setTimeout(45000);
  const headers={Origin:new URL(baseURL).origin};
  await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
  const source=(await (await page.request.get('/api/situations')).json()).find(s=>s.playOutcome.reviewStatus==='ready');
  const created=await page.request.post('/api/situations',{headers,data:{...source,key:`preview-unified-${Date.now()}`,revision:undefined,displayCode:undefined}});
  expect(created.status()).toBe(201);
  const record=(await created.json()).record;
  try{
    await page.goto('/coach-board?edit=1');
    await openLibraryPlay(page,'situation',record.key,record.title);
    await page.getByLabel('Situation name').fill('Unpublished player preview');
    await page.getByRole('navigation',{name:'Editor tools'}).getByRole('button',{name:'Review',exact:true}).click();
    await page.getByRole('button',{name:'Preview as player',exact:true}).click();
    await page.evaluate(()=>window.__DIQ_READY__);
    await expect(page.locator('body')).toHaveClass(/situation-player-preview/);
    await expect(page.locator('#startBtn')).toBeVisible();
    await page.locator('#startBtn').click();
    await expect(page.locator('#checkBtn')).toBeEnabled();
    // Complete positioning checks to expose the player's actual solution action.
    for(let i=0;i<3;i++){
      if(await page.locator('#watchSolutionBtn').isVisible())break;
      await page.locator('#checkBtn').click();
    }
    await expect(page.locator('#watchSolutionBtn')).toBeVisible();
    await page.locator('#watchSolutionBtn').click();
    await expect(page.locator('#wrap')).toHaveAttribute('data-solution-state','ready',{timeout:20000});
    await page.getByRole('button',{name:'Return to editor',exact:true}).click();
    await expect(page.getByLabel('Situation name')).toHaveValue('Unpublished player preview');
    await expect(page.getByRole('navigation',{name:'Editor tools'}).getByRole('button',{name:'Review',exact:true})).toHaveAttribute('aria-current','page');
    expect((await (await page.request.get('/api/situations')).json()).find(s=>s.key===record.key)).toEqual(record);
  }finally{
    await page.request.delete(`/api/situations/${record.key}`,{headers:{...headers,'If-Match':String(record.revision)}});
  }
});
