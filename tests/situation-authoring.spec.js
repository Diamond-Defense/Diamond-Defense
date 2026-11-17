import {openBattedBall,openDefense,selectBoardStep} from './helpers/play-library.js';
import {openLibraryPlay} from './helpers/play-library.js';
import {test,expect} from '@playwright/test';
import {fromSituation} from '../src/lib/plays/board.js';
import {compilePlay} from '../src/lib/plays/animation.js';
import {consolidateSituationRelay} from '../src/lib/plays/authoring.js';
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
  await selectBoardStep(page,'Contact');await openDefense(page);await expect(page.getByRole('button',{name:'SS · Movement 1',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back to Library',exact:true}).click();page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('dialog').getByRole('button',{name:'New Board',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Close Library'}).click();await expect(page.getByLabel('Situation name')).toHaveValue('Structured and visual draft');
  await page.getByRole('button',{name:'Save Situation Changes',exact:true}).click();await expect(page.getByRole('region',{name:'Playback controls'})).toHaveCount(0);await page.getByRole('button',{name:'Publish Situation',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Situation changes saved.');
  const records=await (await page.request.get('/api/situations')).json();expect(records.length).toBe(count);const saved=records.find(s=>s.key===record.key);expect(saved.revision).toBe(record.revision+1);expect(saved.displayCode).toBe(record.displayCode);expect(saved.title).toBe('Structured and visual draft');expect(saved.targets).toEqual(record.targets);expect(saved.extension).toEqual(record.extension);expect(saved.playSeq2).toEqual(record.playSeq2);expect(saved.boardAnimation.movements.SS).toEqual(record.boardAnimation.movements.SS);const play=compilePlay(fromSituation(saved));
  expect(play.tracks.find(track=>track.id==='SS'&&track.index===1).start).toBeGreaterThanOrEqual(play.ballDuration);
  await page.reload();
  await openLibraryPlay(page,'situation',saved.key,saved.title);
  await page.getByRole('button',{name:'Play timeline',exact:true}).click();
  await selectBoardStep(page,'Cover');
  await page.getByRole('button',{name:'SS · Movement 2',exact:true}).click();
  await page.getByText('Timing options',{exact:true}).click();
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
  await page.locator('#signInUsername').fill('admin');
  await page.locator('#signInPassword').fill('password');
  await page.locator('#signInPassword').press('Enter');
  await page.getByRole('button', { name: 'Design workspace' }).click();
  await page.getByRole('link', { name: 'Global library tools' }).click();
  await expect(page.locator('#designWorkspaceBtn')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#staffToolsBtn')).not.toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('button', { name: 'Organizations', exact: true })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Back to Design workspace' })).toHaveAttribute('href', '/design?type=global');
  await expect(page.locator('#situationLibrary')).toBeVisible();
  await page.locator('#situationLibrary').getByRole('button', { name: 'New situation', exact: true }).click();
  const stages = page.getByRole('navigation', { name: 'Editor tools' });
  await expect(stages.getByRole('button')).toHaveText(['Details','Play timeline','Review']);
  const timeline=page.getByRole('region',{name:'Play steps'});
  await expect(timeline.getByRole('button',{name:'Starting alignment',exact:true})).toBeVisible();
  await expect(timeline.getByRole('button',{name:'Contact',exact:true})).toHaveAttribute('aria-current','step');
  const contact=page.getByRole('region',{name:'At contact',exact:true});
  await expect(contact.getByRole('button',{name:'Edit batted ball action',exact:true})).toBeVisible();
  const outcomeAction=contact.getByRole('button',{name:'Edit play outcomes',exact:true});
  await expect(outcomeAction).toHaveAttribute('aria-expanded','false');
  await expect(contact.getByText('Batter & runner movements',{exact:true})).toBeVisible();
  await outcomeAction.click();
  const playResult=contact.getByRole('combobox',{name:'Play result',exact:true});
  await expect(playResult.locator('xpath=../following-sibling::*[1]')).toHaveText('Use recommended outcomes');
  await outcomeAction.click();
  await expect(page.getByRole('button',{name:'+ Add Step',exact:true})).toBeVisible();
  const title = `Training stages ${Date.now()}`;
  await page.getByLabel('Situation name').fill(title);
  await stages.getByRole('button',{name:'Details',exact:true}).click();
  await page.getByLabel('Difficulty').selectOption('advanced');
  await stages.getByRole('button',{name:'Play timeline',exact:true}).click();
  await page.getByRole('combobox', { name: 'Outs', exact: true }).selectOption('1');
  await openBattedBall(page);
  await page.getByLabel('Batted-ball type').selectOption('fly_ball');
  await page.getByRole('button', { name: '+ Add Step', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Before the pitch', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add pickoff throw', exact: true })).toHaveCount(0);
  await page.getByRole('button',{name:'Blank step',exact:true}).click();
  await page.getByRole('button',{name:'Rename',exact:true}).click();
  await page.getByRole('textbox',{name:'Step name'}).fill('Back up the relay');
  await page.getByRole('textbox',{name:'Step name'}).press('Enter');
  await expect(page.getByRole('region',{name:'Play steps'}).getByRole('button',{name:'Back up the relay'})).toBeVisible();
  await stages.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByText('Scoring targets',{exact:true}).click();
  await page.getByRole('spinbutton',{name:'Target tolerance',exact:true}).fill('125');
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
    await openBattedBall(page);
    await page.getByLabel('Batted-ball type').selectOption('line_drive');
    await page.getByLabel('How it’s fielded').selectOption('ground');
    await page.getByRole('navigation',{name:'Editor tools'}).getByRole('button',{name:'Review',exact:true}).click();
    await page.getByText('Scoring targets',{exact:true}).click();
    await page.getByRole('checkbox',{name:'Enable scoring target'}).uncheck();
    await page.getByRole('button',{name:'Preview as player',exact:true}).click();
    await page.evaluate(()=>window.__DIQ_READY__);
    await expect(page.locator('body')).toHaveClass(/situation-player-preview/);
    await expect(page.locator('#wrap .tgt')).toHaveCount(8);
    await expect(page.locator('#startBtn')).toBeVisible();
    await page.clock.install();
    await page.locator('#startBtn').click();
    await page.clock.runFor(1850);
    await expect(page.locator('#wrap .board-hit-path')).toHaveCount(0);
    await expect(page.locator('#wrap .board-ball-shadow')).toHaveCount(1);
    await page.clock.runFor(300);
    await expect(page.locator('#wrap .board-ball-shadow')).toHaveCount(0);
    await expect(page.locator('#checkBtn')).toBeEnabled();
    // Complete positioning checks to expose the player's actual solution action.
    for(let i=0;i<3;i++){
      if(await page.locator('#watchSolutionBtn').isVisible())break;
      await page.locator('#checkBtn').click();
    }
    await expect(page.locator('#watchSolutionBtn')).toBeVisible();
    expect(await page.evaluate(()=>_phase1Summary.scoreTotal)).toBe(8);
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

test('a movement-linked scoring target follows the edited endpoint and keeps its tolerance and notes',async({page,baseURL})=>{
  const headers={Origin:new URL(baseURL).origin};
  await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
  const source=(await (await page.request.get('/api/situations')).json()).find(s=>s.playOutcome.reviewStatus==='ready');
  const board=fromSituation(source);
  const start=board.defenders.SS;
  const middle={x:start.x+70,y:start.y-40};
  const end={x:start.x+130,y:start.y-80};
  board.movements.SS=[{path:[start,middle],start:{event:'contact'}},{path:[middle,end],stepId:'step-cover',start:{event:'step'}}];
  const created=await page.request.post('/api/situations',{headers,data:{
    ...source,key:`follow-target-${Date.now()}`,title:`Follow target ${Date.now()}`,revision:undefined,displayCode:undefined,
    boardAnimation:{version:2,movements:board.movements,battedBall:board.battedBall,steps:[{id:'contact',name:'Contact'},{id:'step-cover',name:'Cover'}]},
  }});
  expect(created.status()).toBe(201);
  let {record}=await created.json();
  try{
    await page.goto('/coach-board?edit=1');
    await openLibraryPlay(page,'situation',record.key,record.title);
    await selectBoardStep(page,'Contact');
    await openDefense(page);
    await page.getByRole('button',{name:'SS · Movement 1',exact:true}).click();
    await page.getByText('Player target',{exact:true}).click();
    const center=page.getByRole('combobox',{name:'Target center'});
    await expect(center).toHaveValue('saved');
    const ring=page.getByTitle('SS scoring target');
    await page.getByRole('button',{name:'Redraw route',exact:true}).click();
    const firstToken=await page.getByRole('button',{name:'SS token',exact:true}).boundingBox();
    await page.mouse.move(firstToken.x+firstToken.width/2,firstToken.y+firstToken.height/2);
    await page.mouse.down();
    await page.mouse.move(firstToken.x+firstToken.width/2+35,firstToken.y+firstToken.height/2-30,{steps:8});
    await page.mouse.up();
    await expect(center).toHaveValue('final');
    await expect.poll(()=>ring.evaluate(el=>parseFloat(el.style.left))).toBeCloseTo(end.x/3200*100);
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    await expect(center).toHaveValue('saved');
    await center.selectOption('step');
    expect(await ring.evaluate(el=>parseFloat(el.style.left))).toBeCloseTo(middle.x/3200*100);
    await page.getByRole('checkbox',{name:'Enable scoring target'}).uncheck();
    await expect(ring).toHaveCount(0);
    await expect(page.getByText('Player target',{exact:true})).toHaveCount(0);
    await page.getByRole('checkbox',{name:'Enable scoring target'}).check();
    await page.getByText('Player target',{exact:true}).click();
    await expect(center).toHaveValue('final');
    expect(await ring.evaluate(el=>parseFloat(el.style.left))).toBeCloseTo(end.x/3200*100);
    await page.getByRole('spinbutton',{name:'Target tolerance',exact:true}).fill('132');
    await expect(page.getByRole('slider',{name:'Target tolerance slider'})).toHaveValue('132');
    await page.getByLabel('Position notes').fill('Cover the bag.');
    await selectBoardStep(page,'Cover');
    const movement=page.getByRole('button',{name:'SS · Movement 2',exact:true});
    await movement.click();
    const token=page.getByRole('button',{name:'SS token',exact:true});
    const tokenLeft=()=>token.evaluate(el=>parseFloat(el.style.left));
    await expect.poll(tokenLeft).toBeCloseTo(end.x/3200*100);
    await page.getByRole('button',{name:'Redraw route',exact:true}).click();
    await expect.poll(tokenLeft).toBeCloseTo(middle.x/3200*100);
    await page.getByRole('button',{name:'Cancel redraw',exact:true}).click();
    await expect.poll(tokenLeft).toBeCloseTo(end.x/3200*100);
    await page.getByRole('button',{name:'Redraw route',exact:true}).click();
    const box=await token.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2-30,{steps:8});
    await page.mouse.up();
    await expect(movement).toHaveAttribute('aria-expanded','true');
    await expect(page.getByRole('status')).toHaveText('Route redrawn.');
    await page.getByRole('button',{name:'Save Situation Changes',exact:true}).click();
    await page.getByLabel('I confirm these play and runner outcomes').check();
    await page.getByRole('button',{name:'Publish Situation',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Situation changes saved.');
    record=(await (await page.request.get('/api/situations')).json()).find(item=>item.key===record.key);
    expect(record.boardAnimation.movements.SS).toHaveLength(2);
    expect(record.boardAnimation.movements.SS.at(-1).start).toEqual({event:'step'});
    expect(record.boardAnimation.movements.SS.at(-1).path[0]).toEqual(middle);
    const endpoint=record.boardAnimation.movements.SS.at(-1).path.at(-1);
    expect(endpoint).not.toEqual(end);
    expect(record.targets.SS).toMatchObject({...endpoint,tol:132,notes:'Cover the bag.',follow:'final',enabled:true});
    await page.reload();
    await openLibraryPlay(page,'situation',record.key,record.title);
    await selectBoardStep(page,'Cover');
    await page.getByRole('button',{name:'SS · Movement 2',exact:true}).click();
    await page.getByText('Player target',{exact:true}).click();
    await expect(center).toHaveValue('final');
    await expect(page.getByRole('slider',{name:'Target tolerance slider'})).toHaveValue('132');
  }finally{
    await page.request.delete(`/api/situations/${record.key}`,{headers:{...headers,'If-Match':String(record.revision)}});
  }
});

test('an existing situation opens with a single relay and saves both throws on that step',async({page,baseURL})=>{
  const headers={Origin:new URL(baseURL).origin};
  await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
  const situations=await (await page.request.get('/api/situations')).json();
  const source=situations.find(item=>item.playSeq.length===3&&!item.playSeq2?.length&&!item.boardAnimation);
  const created=await page.request.post('/api/situations',{headers,data:{
    ...source,key:`relay-${Date.now()}`,title:`Relay fixture ${Date.now()}`,revision:undefined,displayCode:undefined,
  }});
  expect(created.status()).toBe(201);
  let {record}=await created.json();
  try{
    await page.goto('/coach-board?edit=1');
    await openLibraryPlay(page,'situation',record.key,record.title);
    const timeline=page.getByRole('region',{name:'Play steps'});
    for(const [index,from] of record.playSeq.slice(0,-1).entries()){
      await expect(timeline.getByRole('button',{name:`${from} → ${record.playSeq[index+1]}`,exact:true})).toHaveCount(0);
    }
    await selectBoardStep(page,'Relay');
    for(const [index,from] of record.playSeq.slice(0,-1).entries()){
      await expect(page.getByRole('button',{name:`${from} → ${record.playSeq[index+1]}`,exact:true})).toBeVisible();
    }
    await page.getByRole('button',{name:'Save Situation Changes',exact:true}).click();
    await page.getByLabel('I confirm these play and runner outcomes').check();
    await page.getByRole('button',{name:'Publish Situation',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Situation changes saved.');
    const previous=record;
    record=(await (await page.request.get('/api/situations')).json()).find(item=>item.key===previous.key);
    expect(record.playSeq).toEqual(previous.playSeq);
    expect(record.boardAnimation.throwSteps).toEqual(['throw_started:1','throw_started:1']);
    for(const coachBoard of [false,true]){
      const original=compilePlay(fromSituation(previous,{coachBoard}),{coachBoard});
      const consolidated=compilePlay(fromSituation(record,{coachBoard}),{coachBoard});
      expect(consolidated.throws).toEqual(original.throws);
      expect(consolidated.tracks).toEqual(original.tracks);
    }
    await page.reload();
    await openLibraryPlay(page,'situation',record.key,record.title);
    await expect(timeline.getByRole('button',{name:'Relay',exact:true})).toBeVisible();
    const separate=fromSituation(previous,{coachBoard:true});
    separate.movements.SS=[...separate.movements.SS,{path:[separate.movements.SS.at(-1).path.at(-1),separate.defenders.SS],start:{event:'throw_started',throwIndex:2}}];
    expect(consolidateSituationRelay(separate)).toBe(separate);
  }finally{
    await page.request.delete(`/api/situations/${record.key}`,{headers:{...headers,'If-Match':String(record.revision)}});
  }
});

test('caught balls update the batter out and show applicable catch results',async({page,baseURL})=>{
  const headers={Origin:new URL(baseURL).origin};
  await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
  const situations=await (await page.request.get('/api/situations')).json();
  const source=situations.find(item=>item.hitType==='line'&&item.playOutcome.result==='single');
  await page.goto('/coach-board?edit=1');
  await openLibraryPlay(page,'situation',source.key,source.title);
  await selectBoardStep(page,'Starting alignment');
  await page.getByRole('checkbox',{name:'first',exact:true}).check();
  await page.getByRole('checkbox',{name:'second',exact:true}).uncheck();
  await page.getByRole('checkbox',{name:'third',exact:true}).uncheck();
  await page.getByRole('combobox',{name:'Outs',exact:true}).selectOption('1');
  await openBattedBall(page,{outcomes:true});
  const playResult=page.getByRole('combobox',{name:'Play result',exact:true});
  await page.getByLabel('How it’s fielded').selectOption('caught');
  await expect(playResult).toHaveValue('caught_line');
  await expect(page.getByLabel('Batter result')).toHaveValue('out');
  await expect(page.getByLabel('Outs recorded')).toHaveValue('1');
  await expect(playResult.locator('option')).toHaveText(['caught line','sacrifice fly','double play']);
  await page.getByLabel('Batted-ball type').selectOption('fly_ball');
  await expect(playResult).toHaveValue('caught_fly');
  await playResult.selectOption('sacrifice_fly');
  await expect(page.getByRole('combobox',{name:'Runner on first',exact:true})).toHaveValue('home');
  await expect(page.getByLabel('Runner on first tagged up')).toBeChecked();
  await selectBoardStep(page,'Starting alignment');
  await page.getByRole('combobox',{name:'Outs',exact:true}).selectOption('2');
  await openBattedBall(page,{outcomes:true});
  await expect(playResult.locator('option')).toHaveText(['caught fly']);
  await page.getByLabel('How it’s fielded').selectOption('ground');
  await expect(playResult).toHaveValue('single');
  await expect(page.getByLabel('Batter result')).toHaveValue('first');
  await expect(playResult.locator('option')).toHaveText([
    'single','double','triple','home run','ground rule double','groundout','fielders choice','error','other'
  ]);
  await page.getByLabel('How it’s fielded').selectOption('caught');
  await page.getByLabel('Batted-ball type').selectOption('ground_ball');
  await expect(page.getByLabel('How it’s fielded').locator('option')).toHaveText(['Fielded on the ground']);
  await expect(playResult).toHaveValue('single');
  await selectBoardStep(page,'Starting alignment');
  await page.getByRole('checkbox',{name:'third',exact:true}).check();
  await page.getByRole('combobox',{name:'Outs',exact:true}).selectOption('1');
  await openBattedBall(page,{outcomes:true});
  await expect(playResult.locator('option')).toHaveText([
    'single','double','triple','home run','ground rule double','groundout',
    'sacrifice bunt','squeeze bunt','fielders choice','double play','error','other'
  ]);
});
