import {openLibraryPlay} from './helpers/play-library.js';
import { test, expect, request as requests } from '@playwright/test';
import { newBoard } from '../src/lib/plays/board.js';

test('Board storage requires staff access, accepts incomplete boards, and rejects stale updates',async({request,baseURL})=>{
 expect((await request.get('/api/boards')).status()).toBe(401);
 const headers={Origin:new URL(baseURL).origin};
 await request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
 const board=newBoard();board.title=`API Board ${Date.now()}`;
 const response=await request.post('/api/boards',{headers,data:{board}});expect(response.status()).toBe(201);const saved=await response.json();
 const list=await (await request.get('/api/boards')).json();expect(list.find(b=>b.id===saved.id).board).toEqual(board);
 board.title+=' edited';expect((await request.post('/api/boards',{headers,data:{...saved,board}})).status()).toBe(200);
 expect((await request.post('/api/boards',{headers,data:{...saved,board}})).status()).toBe(409);
 expect((await request.post('/api/boards',{headers:{Origin:'https://other.example'},data:{board}})).status()).toBe(403);
 board.defenders.P.x=-1;expect((await request.post('/api/boards',{headers,data:{board}})).status()).toBe(400);
 const player=await requests.newContext({baseURL});await player.post('/api/auth/login',{headers,data:{role:'player',teamId:'13u-black',playerId:'13u-black-bob-smith-11',password:'password'}});expect((await player.get('/api/boards')).status()).toBe(403);await player.dispose();
});

test('coach board authors curved movement, replays, reloads and converts to existing Situation data',async({page,baseURL})=>{
 test.setTimeout(30000);
 const headers={Origin:new URL(baseURL).origin};
 await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-diq-runtime','loaded');await page.evaluate(()=>window.__DIQ_READY__);await expect(page.locator('#fieldImg')).toBeVisible();
 await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Coach Board',exact:true}).click()]);
 await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'New Board',exact:true}).click();await expect(page.getByRole('heading',{name:'Coach Board',exact:true})).toBeVisible();
 const name=`UI Board ${Date.now()}`;await page.getByLabel('Board name').fill(name);
 const token=page.getByRole('button',{name:'SS token',exact:true});
 await token.scrollIntoViewIfNeeded();const box=await token.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+50,box.y+20,{steps:8});await page.mouse.up();
 await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');
 let boards=await (await page.request.get('/api/boards')).json();const created=boards.find(b=>b.board.title===name);expect(created.board.movements).toEqual({});expect(created.board.defenders.SS).not.toEqual(newBoard().defenders.SS);
 await page.getByRole('button',{name:'Movement',exact:true}).click();await token.scrollIntoViewIfNeeded();const start=await token.boundingBox();let field=await page.locator('.board-field').boundingBox();
 await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await page.mouse.move(start.x,start.y-80,{steps:10});await page.mouse.move(start.x+100,start.y-90,{steps:10});await page.mouse.move(start.x+140,start.y+10,{steps:10});await page.mouse.up();
 await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');boards=await (await page.request.get('/api/boards')).json();expect(boards.find(b=>b.id===created.id).board.movements.SS[0].path.length).toBeGreaterThan(3);
 await page.getByRole('button',{name:'Ball',exact:true}).click();await page.getByLabel('Batted-ball type').selectOption('fly_ball');await page.locator('.board-field').scrollIntoViewIfNeeded();field=await page.locator('.board-field').boundingBox();await page.mouse.click(field.x+field.width*0.25,field.y+field.height*0.3);
 await page.getByRole('button',{name:'Throws',exact:true}).click();for(const id of ['SS','2B','1B'])await page.getByRole('group',{name:'Choose throw positions',exact:true}).getByRole('button',{name:id,exact:true}).click();
 await page.getByRole('button',{name:'Undo Last Throw',exact:true}).click();await page.getByRole('group',{name:'Choose throw positions',exact:true}).getByRole('button',{name:'1B',exact:true}).click();await expect(page.getByRole('group',{name:'Throw sequence',exact:true})).toContainText('3. 1B');
 await page.getByRole('button',{name:'Play',exact:true}).click();await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Pause',exact:true}).click();
 for(let i=0;i<8 && await page.locator('.board-throws .seq-route-active').count()===0;i++)await page.getByRole('button',{name:'Next Step',exact:true}).click();await expect(page.locator('.board-throws .seq-route-active')).toHaveCount(1);
 await page.getByRole('button',{name:'Restart',exact:true}).click();await expect(page.locator('.board-throws .seq-route-active')).toHaveCount(0);
 await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');
 await page.reload();await openLibraryPlay(page,'board',created.id,name);await expect(page.getByLabel('Board name')).toHaveValue(name);
 await page.getByRole('button',{name:'Save as Situation',exact:true}).click();await expect(page.getByRole('navigation',{name:'Authoring modes'})).toHaveCount(0);await expect(page.getByRole('region',{name:'Playback controls'})).toHaveCount(0);await page.getByRole('button',{name:'Create Situation',exact:true}).click();await expect(page.getByRole('status')).toContainText('Confirm');
 await page.getByLabel('I confirm these play and runner outcomes').check();await page.getByRole('button',{name:'Create Situation',exact:true}).click();await expect(page.getByRole('status')).toContainText('created.');
 const situation=(await (await page.request.get('/api/situations')).json()).find(s=>s.title===name);expect(situation.targets.SS.x).toBeCloseTo(boards.find(b=>b.id===created.id).board.movements.SS[0].path.at(-1).x);expect(situation.boardAnimation.version).toBe(2);expect(situation.batterAdvance).toBe(1);
 await page.getByRole('button',{name:'Back to Board Tools',exact:true}).click();await page.getByRole('button',{name:'Present',exact:true}).click();await page.getByRole('region',{name:'Presentation controls'}).getByRole('button',{name:'Next Step',exact:true}).click();await page.getByRole('region',{name:'Presentation controls'}).getByRole('button',{name:'Replay',exact:true}).click();await page.getByRole('button',{name:'Exit Presentation',exact:true}).click();await expect(page.getByRole('button',{name:'Situation Details',exact:true})).toHaveCount(0);await openLibraryPlay(page,'situation',situation.key,situation.title);await expect(page.getByRole('status')).toContainText('Situation loaded');expect(errors).toEqual([]);await page.screenshot({path:'/tmp/coach-board-desktop.png',fullPage:true});
 await Promise.all([page.waitForEvent('load'),page.getByRole('link',{name:'Back to field',exact:true}).click()]);await expect(page.locator('html')).toHaveAttribute('data-diq-runtime','loaded');await page.evaluate(()=>window.__DIQ_READY__);await expect(page.locator('#coachBoardLink')).toBeVisible();await expect(page.locator('#accountMenuTriggerLabel')).toHaveText('Administrator');await expect(page.locator('.training-navigation')).toBeVisible();expect(errors).toEqual([]);await page.evaluate(key=>setSituation(key),situation.key);await expect(page.locator('#fieldImg')).toBeVisible();await page.request.delete(`/api/situations/${situation.key}`,{headers:{...headers,'If-Match':String(situation.revision)}});
});

test('phone touch input records runner routes and keeps controls within the viewport',async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const headers={Origin:new URL(baseURL).origin};await context.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
 const page=await context.newPage();await page.goto('/coach-board?edit=1');await page.getByLabel('Board name').fill(`Touch Board ${Date.now()}`);
 await page.getByRole('checkbox',{name:'first',exact:true}).check();await page.getByRole('button',{name:'Movement',exact:true}).click();
 const token=page.getByRole('button',{name:'first token',exact:true});await token.scrollIntoViewIfNeeded();const box=await token.boundingBox();
 const cdp=await context.newCDPSession(page);const x=box.x+box.width/2,y=box.y+box.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*6,y:y-i*4}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');
 const title=await page.getByLabel('Board name').inputValue();const saved=(await (await context.request.get('/api/boards')).json()).find(b=>b.board.title===title);expect(saved.board.movements.first[0].path.length).toBeGreaterThan(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/coach-board-phone.png',fullPage:true});await context.close();
});

test('coaches save their own boards and cannot read or overwrite another owner’s board',async({request,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};await request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
 const prefix=`board-owner-${Date.now()}`;
 const team=await request.post('/api/admin/teams',{headers,data:{id:prefix,name:prefix}});expect(team.status()).toBe(201);
 const contexts=[];
 try{
  for(let i=0;i<2;i++){
   const coachId=`${prefix}-${i}`;
   expect((await request.post(`/api/admin/teams/${prefix}/members`,{headers,data:{userId:coachId,name:`Board owner ${i}`,role:'coach',password:'Initial-1234'}})).status()).toBe(201);
   const coach=await requests.newContext({baseURL});contexts.push(coach);
   expect((await coach.post('/api/auth/login',{headers,data:{role:'coach',teamId:prefix,coachId,password:'Initial-1234'}})).ok()).toBeTruthy();
   expect((await coach.put('/api/auth/password',{headers,data:{currentPassword:'Initial-1234',newPassword:'Changed-1234'}})).ok()).toBeTruthy();
  }
  const board=newBoard();const response=await contexts[0].post('/api/boards',{headers,data:{board}});expect(response.status()).toBe(201);const saved=await response.json();
  expect((await (await contexts[0].get('/api/boards')).json()).some(b=>b.id===saved.id)).toBe(true);
  expect((await (await contexts[1].get('/api/boards')).json()).some(b=>b.id===saved.id)).toBe(false);
  expect((await contexts[1].post('/api/boards',{headers,data:{...saved,board}})).status()).toBe(409);
 }finally{for(const context of contexts)await context.dispose();const record=(await team.json()).record;await request.delete(`/api/admin/teams/${prefix}`,{headers:{...headers,'If-Match':String(record.revision)}});}
});

test('segmented authoring records from prior endpoints and preserves events on reload',async({page,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
 await page.goto('/coach-board?edit=1');const title=`Segments ${Date.now()}`;await page.getByLabel('Board name').fill(title);
 await page.getByRole('button',{name:'Movement',exact:true}).click();await page.getByRole('combobox',{name:'Token',exact:true}).selectOption('SS');
 async function drag(dx,dy){const token=page.getByRole('button',{name:'SS token',exact:true});await token.scrollIntoViewIfNeeded();const r=await token.boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx/2,y+dy-25,{steps:8});await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();}
 await drag(30,-20);await page.getByRole('button',{name:'Add Movement',exact:true}).click();await drag(40,20);
 await page.getByRole('combobox',{name:'Start movement',exact:true}).selectOption('ball_fielded');await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');
 let item=(await (await page.request.get('/api/boards')).json()).find(item=>item.board.title===title);expect(item.board.version).toBe(2);expect(item.board.movements.SS).toHaveLength(2);expect(item.board.movements.SS[1].path[0]).toEqual(item.board.movements.SS[0].path.at(-1));expect(item.board.movements.SS[1].start.event).toBe('ball_fielded');
 await page.getByRole('combobox',{name:'Movement',exact:true}).selectOption('0');await drag(-15,15);await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');item=(await (await page.request.get('/api/boards')).json()).find(record=>record.id===item.id);expect(item.board.movements.SS[1].path[0]).toEqual(item.board.movements.SS[0].path.at(-1));
 await page.reload();await openLibraryPlay(page,'board',item.id,title);await page.getByRole('button',{name:'Movement',exact:true}).click();await page.getByRole('combobox',{name:'Token',exact:true}).selectOption('SS');await page.getByRole('combobox',{name:'Movement',exact:true}).selectOption('1');await expect(page.getByRole('combobox',{name:'Start movement',exact:true})).toHaveValue('ball_fielded');
 await page.getByRole('button',{name:'Delete Movement',exact:true}).click();await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');item=(await (await page.request.get('/api/boards')).json()).find(record=>record.id===item.id);expect(item.board.movements.SS).toHaveLength(1);
});

test('v1 boards remain readable and unavailable throw events are rejected server-side',async({request,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};await request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
 const board=newBoard();board.version=1;board.movements.SS=[{path:[board.defenders.SS,{x:1400,y:900}]}];const before=JSON.stringify(board);
 const response=await request.post('/api/boards',{headers,data:{board}});expect(response.status()).toBe(201);const saved=await response.json();const listed=(await (await request.get('/api/boards')).json()).find(item=>item.id===saved.id);expect(JSON.stringify(listed.board)).toBe(before);
 board.version=2;board.movements.SS[0].start={event:'throw_received',throwIndex:1};const invalid=await request.post('/api/boards',{headers,data:{board}});expect(invalid.status()).toBe(400);expect((await invalid.json()).error).toContain('unavailable throw');
});

test('normal solution review consumes segmented metadata and reduced motion preserves targets',async({page,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
 await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-diq-runtime','loaded');await page.evaluate(()=>window.__DIQ_READY__);await expect(page.locator('#fieldImg')).toBeVisible();
 const expected=await page.evaluate(()=>{
  coachUnlocked=false;_roundHasStarted=true;phase2Active=false;_phase2Ended=false;_allTargetsCorrect=true;gameActive=false;
  const board=window._diqFromSituation(currentSituation),start=board.defenders.SS,target=currentSituation.targets.SS;
  const middle={x:start.x+100,y:start.y-100};
  board.movements.SS=[{path:[start,middle],start:{event:'contact'}},{path:[middle,{x:middle.x+80,y:middle.y-100},{x:target.x,y:target.y}],start:{event:'ball_fielded'}}];
  currentSituation.boardAnimation={version:2,movements:board.movements,battedBall:board.battedBall};
  currentSituation.playSeq=['SS','2B','1B'];currentSituation.playSeq2=[];
  _solutionReview={situationKey:currentSituation.key,submittedPositions:getOnscreenStarts(),incorrectIds:[],hasSeq:true,animating:false,watched:false};
  const before=JSON.stringify(currentSituation),play=window._diqPlayAnimation.compilePlay(window._diqFromSituation(currentSituation));
  const track=play.tracks.find(track=>track.id==='SS'&&track.index===1),time=track.start+track.duration/2;
  const clocks={now:playNow,request:requestPlayFrame,cancel:cancelPlayFrame};let now=0,next;playNow=()=>now;requestPlayFrame=fn=>(next=fn,1);cancelPlayFrame=()=>next=null;
  window._diqWatchSolution();now=1000;next(now);const hitVisible=!!ballSvg.querySelector('[data-solution-hit]'),ballVisible=ballEl.isConnected&&getComputedStyle(ballEl).display!=='none',ballPosition={x:parseFloat(ballEl.style.left),y:parseFloat(ballEl.style.top)},expectedBall=nativeToCssPoint(window._diqPlayAnimation.frameAt(play,250).ball);const slowPosition={...tokens.get('SS').pos},slowExpected=window._diqPlayAnimation.frameAt(play,250).positions.SS;_sharedSolutionPlayback.seek(time);playNow=clocks.now;requestPlayFrame=clocks.request;cancelPlayFrame=clocks.cancel;
  return {before,hitVisible,ballVisible,ballPosition,expectedBall,slowPosition,slowExpected,position:window._diqPlayAnimation.frameAt(play,time).positions.SS};
 });
 expect(expected.hitVisible).toBe(true);expect(expected.ballVisible).toBe(true);expect(expected.ballPosition.x).toBeCloseTo(expected.expectedBall.x,2);expect(expected.ballPosition.y).toBeCloseTo(expected.expectedBall.y,2);expect(expected.slowPosition).toEqual(expected.slowExpected);expect(await page.evaluate(()=>tokens.get('SS').pos)).toEqual(expected.position);
 expect(await page.evaluate(()=>JSON.stringify(currentSituation))).toBe(expected.before);
 await page.evaluate(()=>cancelSolutionAnimation());await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>{_solutionReview.animating=false;window._diqWatchSolution();});
 await expect(page.locator('#wrap')).toHaveAttribute('data-solution-state','ready');
 expect(await page.evaluate(()=>POS_IDS.every(id=>Math.hypot(tokens.get(id).pos.x-currentSituation.targets[id].x,tokens.get(id).pos.y-currentSituation.targets[id].y)<0.01))).toBe(true);
 await expect(page.locator('.shared-solution-trail .seq-route-active')).toHaveCount(2);
 expect(await page.evaluate(()=>JSON.stringify(currentSituation))).toBe(expected.before);
});

test('Board names are unique per owner across creation and renaming, including concurrent saves',async({request,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};await request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});
 const board=newBoard();board.title=`Unique board ${Date.now()}`;
 const responses=await Promise.all([request.post('/api/boards',{headers,data:{board}}),request.post('/api/boards',{headers,data:{board}})]);
 expect(responses.map(r=>r.status()).sort()).toEqual([201,409]);const saved=await responses.find(r=>r.status()===201).json();
 const alias={...board,title:`  ${board.title.toUpperCase()}  `};expect((await request.post('/api/boards',{headers,data:{board:alias}})).status()).toBe(409);
 board.outs=1;expect((await request.post('/api/boards',{headers,data:{...saved,board}})).status()).toBe(200);
 const other={...newBoard(),title:`Other ${Date.now()}`};const created=await request.post('/api/boards',{headers,data:{board:other}});expect(created.status()).toBe(201);const second=await created.json();
 const rejected=await request.post('/api/boards',{headers,data:{...second,board:alias}});expect(rejected.status()).toBe(409);expect((await rejected.json()).error).toContain('already have a Board');
 const listed=await (await request.get('/api/boards')).json();expect(listed.find(b=>b.id===second.id).board.title).toBe(other.title);expect(listed.filter(b=>b.board.title===board.title)).toHaveLength(1);
});

test('movement endpoints remain visible and return throws retain repeated defenders',async({page,baseURL})=>{
 const headers={Origin:new URL(baseURL).origin};await page.request.post('/api/auth/login',{headers,data:{role:'admin',password:'password'}});await page.goto('/coach-board?edit=1');const title=`Movement endpoints ${Date.now()}`;await page.getByLabel('Board name').fill(title);await page.getByRole('button',{name:'Movement',exact:true}).click();
 const token=page.getByRole('button',{name:'SS token',exact:true});const read=()=>token.evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));
 async function drag(){await token.scrollIntoViewIfNeeded();const box=await token.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2-25,{steps:6});await page.mouse.up();}
 await expect(page.locator('.board-movement-path')).toHaveCount(0);await drag();await expect(page.locator('.board-movement-path[data-position=SS]')).toHaveCount(1);const endpoint=await read();await page.getByRole('button',{name:'Add Movement',exact:true}).click();expect(await read()).toEqual(endpoint);await drag();await expect(page.locator('.board-movement-path[data-position=SS]')).toHaveCount(2);const second=await read();await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');let record=(await (await page.request.get('/api/boards')).json()).find(r=>r.board.title===title);expect(record.board.movements.SS).toHaveLength(2);expect(record.board.movements.SS[1].path[0]).toEqual(record.board.movements.SS[0].path.at(-1));expect(second.x).toBeCloseTo(record.board.movements.SS[1].path.at(-1).x/3200*100);
 await page.getByRole('button',{name:'Throws',exact:true}).click();const choices=page.getByRole('group',{name:'Choose throw positions'});for(const id of ['C','2B','C'])await choices.getByRole('button',{name:id,exact:true}).click();await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');record=(await (await page.request.get('/api/boards')).json()).find(r=>r.board.title===title);expect(record.board.playSeq).toEqual(['C','2B','C']);
});
