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

test('a coach without Designer retains Training but cannot open a scoped editor',async({page,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};
 expect((await page.request.post('/api/auth/login',{headers,data:{username:'jamie.rivera',password:'password'}})).ok()).toBe(true);
 expect((await page.request.get('/api/training/scopes')).ok()).toBe(true);
 expect((await page.request.get('/coach-board?design=team&id=13u-black')).status()).toBe(403);
});

test('a new Situation draft creates its first record only when published from Coach Board',async({page,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};const login=await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});const user=(await login.json()).user;
 const records=await (await page.request.get('/api/situations')).json(),source=records[0];const draft={...source,key:`new-draft-${Date.now()}`,title:`New draft ${Date.now()}`,revision:undefined,displayCode:undefined};
 await page.goto('/coach-board?edit=1');await page.evaluate(({draft,userId})=>sessionStorage.setItem('diq-situation-authoring-v1',JSON.stringify({version:1,userId,destination:'board',situation:draft,baseline:draft,createdAt:Date.now()})),{draft,userId:user.id});await page.reload();await expect(page.getByLabel('Situation name')).toHaveValue(draft.title);
 expect((await (await page.request.get('/api/situations')).json()).some(s=>s.key===draft.key)).toBe(false);
 await page.getByRole('button',{name:'Save Situation Changes',exact:true}).click();await page.getByRole('button',{name:'Publish Situation',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Situation created.');const saved=(await (await page.request.get('/api/situations')).json()).find(s=>s.key===draft.key);expect(saved.revision).toBe(1);await page.request.delete(`/api/situations/${saved.key}`,{headers:{...headers,'If-Match':'1'}});
});

test('Design opens a new situation in the shared staged editor without publishing it',async({page,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};await page.request.post('/api/auth/login',{headers,data:{username:'admin',password:'password'}});
 const before=(await (await page.request.get('/api/situations')).json()).map(item=>item.key).sort();
 await page.goto('/workspace/design?type=global');await page.getByRole('link',{name:'+ New situation',exact:true}).click();
 const stages=page.getByRole('navigation',{name:'Editor tools'});await expect(stages).toBeVisible();
 await page.getByLabel('Situation name').fill('Unpublished design draft');
 await stages.getByRole('button',{name:'Review',exact:true}).click();
 await expect(page.getByRole('button',{name:'Publish Situation',exact:true})).toBeDisabled();
 expect((await (await page.request.get('/api/situations')).json()).map(item=>item.key).sort()).toEqual(before);
});

test('Training no longer exposes the retired Situation Proposals editor',async({page,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};await page.request.post('/api/auth/login',{headers,data:{username:'jamie.rivera',password:'password'}});
 await page.goto('/workspace/training');await expect(page.locator('#trainingDashboard')).toBeVisible();
 await expect(page.getByRole('button',{name:'Situation Proposals',exact:true})).toHaveCount(0);
 await expect(page.locator('#designWorkspaceBtn')).toBeHidden();
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
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('#watchSolutionBtn').press('Enter');
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
  await expect(page.getByRole('combobox',{name:'Runner on first',exact:true})).toHaveValue('hold');
  await expect(page.getByLabel('Runner on first tagged up')).not.toBeChecked();
  await selectBoardStep(page,'Starting alignment');
  await page.getByRole('checkbox',{name:'third',exact:true}).check();
  await openBattedBall(page,{outcomes:true});
  await playResult.selectOption('caught_fly');
  await playResult.selectOption('sacrifice_fly');
  await expect(page.getByRole('combobox',{name:'Runner on third',exact:true})).toHaveValue('home');
  await expect(page.getByLabel('Runner on third tagged up')).toBeChecked();
  await expect(page.getByRole('combobox',{name:'Runner on first',exact:true})).toHaveValue('hold');
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
