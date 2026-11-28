import {readFileSync} from 'node:fs';
import {fromSituation,boardAnimation,validateBoard} from '../src/lib/plays/board.js';
import {syncSituationAnimation} from '../src/lib/plays/authoring.js';
import {exportBoardFile,importBoardFile} from '../src/lib/plays/board-transfer.js';
import {selectBoardStep,openRunnerAdvances} from './helpers/play-library.js';
import {openLibraryPlay} from './helpers/play-library.js';
import {test,expect} from '@playwright/test';
import {newBoard} from '../src/lib/plays/board.js';
import {compilePlay,frameAt,hitBounceDuration} from '../src/lib/plays/animation.js';
import {presentationStatus} from '../src/lib/plays/presentation.js';
test.use({hasTouch:true});
async function login(page,baseURL){await page.request.post('/api/auth/login',{headers:{Origin:new URL(baseURL).origin},data:{role:'admin',password:'password'}});}
async function loadBoard(page,baseURL,board){const response=await page.request.post('/api/boards',{headers:{Origin:new URL(baseURL).origin},data:{board}});expect(response.status()).toBe(201);const saved=await response.json();await page.goto('/coach-board?edit=1');await openLibraryPlay(page,'board',saved.id,board.title);return saved;}
function demonstration(){const b=newBoard();b.title=`Double play presentation ${Date.now()}`;b.battedBall={type:'ground_ball',start:{x:1500,y:1800},destination:{x:1300,y:900}};b.playSeq=['SS','2B','1B'];const middle={x:1300,y:900};b.movements.SS=[{path:[b.defenders.SS,{x:1200,y:950},middle],start:{event:'contact'}},{path:[middle,{x:1500,y:850}],start:{event:'ball_fielded'}}];b.movements.CF=[{path:[b.defenders.CF,{x:1800,y:600}],start:{event:'contact'}}];return b;}
async function tokenPosition(page,id){return page.getByRole('button',{name:`${id} token`,exact:true}).evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));}
test('saved segmented Board presents stable event steps and restores authoring without writes',async({page,baseURL})=>{
 await login(page,baseURL);const board=demonstration(),saved=await loadBoard(page,baseURL,board),play=compilePlay(board,{coachBoard:true});const writes=[];page.on('request',r=>{if(['POST','PUT','DELETE'].includes(r.method()))writes.push(r.url());});
 await selectBoardStep(page,'Ball fielded');await page.getByRole('button',{name:'SS · Movement 2',exact:true}).click();await page.getByRole('button',{name:'Present',exact:true}).click();
 const controls=page.getByRole('region',{name:'Presentation controls'});const fieldBounds=await page.locator('.board-field').boundingBox();await expect(page.locator('.board-hit-path')).toHaveCount(0);await expect(page.getByRole('complementary',{name:'Coach Board tools'})).toHaveCount(0);await expect(controls.getByRole('status')).toHaveText('Starting alignment');
 for(let i=1;i<play.steps.length;i++){
  await controls.getByRole('button',{name:'Next Step',exact:true}).click();const frame=frameAt(play,play.steps[i]);await expect(controls.getByRole('status')).toHaveText(presentationStatus(play,frame));expect(await page.locator('.board-field').boundingBox()).toEqual(fieldBounds);if(frame.time>=play.contactTime&&frame.time<play.contactTime+play.ballDuration)await expect(page.locator('.board-hit-path')).toHaveCount(1);else await expect(page.locator('.board-hit-path')).toHaveCount(0);const actual=await tokenPosition(page,'SS');expect(actual.x).toBeCloseTo(frame.positions.SS.x/3200*100);expect(actual.y).toBeCloseTo(frame.positions.SS.y/2133*100);await expect(page.locator('.board-field .seq-badge')).toHaveCount(Object.keys(frame.relayOrder).length);
 }
 await controls.getByRole('button',{name:'Previous Step',exact:true}).click();await controls.getByRole('button',{name:'Next Step',exact:true}).click();await expect(controls.getByRole('status')).toContainText('Final state');await controls.getByRole('button',{name:'Replay',exact:true}).click();await expect(controls.getByRole('status')).toHaveText('Starting alignment');await expect(page.locator('.board-field .seq-badge')).toHaveCount(0);
 await expect(controls.getByLabel('Show Labels')).toHaveCount(0);await expect(page.getByRole('button',{name:'SS token',exact:true})).toHaveText('SS');await expect(page.locator('.board-hit-path')).toHaveCount(0);
 const startingToken=page.getByRole('button',{name:'SS token',exact:true});const rect=await startingToken.boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+80,rect.y+40,{steps:5});await page.mouse.up();expect((await tokenPosition(page,'SS')).x).toBeCloseTo(board.defenders.SS.x/3200*100);expect((await tokenPosition(page,'SS')).y).toBeCloseTo(board.defenders.SS.y/2133*100);
 const start=await tokenPosition(page,'SS');await controls.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(()=>tokenPosition(page,'SS')).not.toEqual(start);await expect(page.locator('.board-hit-path')).toHaveCount(1);await controls.getByRole('button',{name:'Pause',exact:true}).click();const frozen=await tokenPosition(page,'SS');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(await tokenPosition(page,'SS')).toEqual(frozen);await expect(controls.getByRole('button',{name:'Play',exact:true})).toBeVisible();await controls.getByRole('button',{name:'Next Step',exact:true}).click();await controls.getByRole('button',{name:'Play',exact:true}).click();await controls.getByRole('button',{name:'Pause',exact:true}).click();
 await page.getByRole('button',{name:'Exit Presentation',exact:true}).click();await expect(page.getByRole('button',{name:'SS · Movement 2',exact:true})).toHaveAttribute('aria-expanded','true');await expect(page.getByLabel('More actions',{exact:true})).toBeVisible();expect(writes).toEqual([]);const stored=(await (await page.request.get('/api/boards')).json()).find(b=>b.id===saved.id);expect(stored.board).toEqual(board);await page.screenshot({path:'/tmp/presentation-editor-return.png',fullPage:true});
});

test('touch presentation supports incomplete Boards and reduced-motion final snapshots',async({page,baseURL})=>{
 await page.setViewportSize({width:820,height:1180});await login(page,baseURL);await page.goto('/coach-board?edit=1');await page.getByRole('button',{name:'Present',exact:true}).click();await expect(page.getByRole('region',{name:'Presentation controls'}).getByRole('status')).toHaveText('Starting alignment');await page.getByRole('button',{name:'Exit Presentation',exact:true}).click();
 const board=demonstration();await loadBoard(page,baseURL,board);await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Present',exact:true}).click();const controls=page.getByRole('region',{name:'Presentation controls'});const fieldBounds=await page.locator('.board-field').boundingBox();await expect(page.locator('.board-hit-path')).toHaveCount(0);await controls.getByRole('button',{name:'Play',exact:true}).tap();await expect(controls.getByRole('status')).toContainText('Final state');await expect(page.locator('.board-hit-path')).toHaveCount(0);const final=await tokenPosition(page,'SS');expect(final.x).toBeCloseTo(1500/3200*100);await controls.getByRole('button',{name:'Replay',exact:true}).click();await controls.getByRole('button',{name:'Next Step',exact:true}).click();await expect(controls.getByRole('status')).not.toHaveText('Starting alignment');
 expect(await controls.getByRole('button',{name:'Next Step',exact:true}).evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(56);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'/tmp/presentation-tablet.png',fullPage:true});await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.getByRole('button',{name:'Exit Presentation',exact:true}).evaluate(el=>el.getBoundingClientRect().right<=innerWidth)).toBe(true);await controls.getByRole('button',{name:'Replay',exact:true}).tap();await controls.getByRole('button',{name:'Next Step',exact:true}).tap();await page.screenshot({path:'/tmp/presentation-phone.png',fullPage:true});await page.keyboard.press('Escape');await expect(controls).toHaveCount(0);
});

test('training presentation returns to the staged editor without saving',async({page,baseURL})=>{
 await login(page,baseURL);
 const [original]=await (await page.request.get('/api/situations')).json();
 await page.goto('/coach-board');
 await openLibraryPlay(page,'situation',original.key,original.title);
 await page.getByLabel('Situation name').fill('Unpublished presentation');
 const writes=[];page.on('request',r=>{if(['POST','PUT','DELETE'].includes(r.method()))writes.push(r.url());});
 await page.getByRole('navigation',{name:'Editor tools'}).getByRole('button',{name:'Play timeline',exact:true}).click();
 await page.getByRole('button',{name:'Present',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Unpublished presentation',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Exit Presentation',exact:true}).click();
 await expect(page.getByLabel('Situation name')).toHaveValue('Unpublished presentation');
 expect(writes).toEqual([]);
});

test('teaching comparisons and focused targets use shared final snapshots without authoring writes',async({page,baseURL})=>{
 await login(page,baseURL);const board=demonstration(),saved=await loadBoard(page,baseURL,board),play=compilePlay(board,{coachBoard:true}),final=frameAt(play,play.duration);
 await page.getByRole('button',{name:'Present',exact:true}).click();const tools=page.getByRole('group',{name:'Teaching views'});
 await expect(page.locator('.board-ball')).toHaveCount(0);await expect(page.locator('.board-movement-path')).toHaveCount(0);await tools.getByLabel('Show Movement Paths').check();await expect(page.locator('.board-movement-path')).toHaveCount(0);await expect(page.locator('.board-movement-path[marker-end]')).toHaveCount(0);await expect(page.locator('.ghost-target')).toHaveCount(0);await tools.getByLabel('Show Targets').check();await expect(page.locator('.ghost-target')).toHaveCount(9);
 await tools.locator('.focus-picker summary').click();await tools.getByLabel('SS',{exact:true}).check();await tools.getByLabel('CF',{exact:true}).check();await expect(page.locator('.teaching-focus')).toHaveCount(2);await expect(page.locator('.ghost-target')).toHaveCount(2);await tools.getByLabel('CF',{exact:true}).uncheck();await expect(tools.locator('.focus-picker')).toHaveAttribute('open','');await page.locator('.board-header h1').tap();await expect(tools.locator('.focus-picker')).not.toHaveAttribute('open','');await expect(page.locator('.teaching-focus')).toHaveCount(1);await tools.locator('.focus-picker summary').click();await page.keyboard.press('Escape');await expect(tools.locator('.focus-picker')).not.toHaveAttribute('open','');await expect(page.getByRole('region',{name:'Presentation controls'})).toBeVisible();await expect(page.locator('.ghost-target')).toHaveCount(1);await expect(page.locator('.board-movement-path')).toHaveCount(0);await expect(page.locator('.board-movement-path[data-position=CF]')).toHaveCount(0);await expect(page.getByRole('button',{name:'SS token',exact:true})).toHaveClass(/teaching-focus/);await expect(page.getByRole('button',{name:'CF token',exact:true})).toBeVisible();
 const target=await page.getByLabel('SS final target',{exact:true}).evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));expect(target.x).toBeCloseTo(final.positions.SS.x/3200*100);expect(target.y).toBeCloseTo(final.positions.SS.y/2133*100);
 await expect(tools.getByRole('button',{name:'Final Position',exact:true})).toHaveCount(0);for(let i=1;i<play.steps.length;i++)await page.getByRole('region',{name:'Presentation controls'}).getByRole('button',{name:'Next Step',exact:true}).click();expect(await tokenPosition(page,'SS')).toEqual(target);await expect(page.getByRole('region',{name:'Presentation controls'}).getByRole('status')).toContainText('Final state');
 await expect(tools.getByRole('button',{name:'Starting Position',exact:true})).toHaveCount(0);await page.getByRole('region',{name:'Presentation controls'}).getByRole('button',{name:'Replay',exact:true}).click();const start=await tokenPosition(page,'SS');expect(start.x).toBeCloseTo(board.defenders.SS.x/3200*100);
 await expect(tools.getByRole('button',{name:'Animate',exact:true})).toHaveCount(0);await page.getByRole('region',{name:'Presentation controls'}).getByRole('button',{name:'Play',exact:true}).click();await expect(page.getByRole('region',{name:'Presentation controls'}).getByRole('button',{name:'Pause',exact:true})).toBeVisible();await expect.poll(()=>tokenPosition(page,'SS')).not.toEqual(start);await page.getByRole('region',{name:'Presentation controls'}).getByRole('button',{name:'Pause',exact:true}).click();
 await tools.locator('.focus-picker summary').click();await tools.getByRole('button',{name:'All Players',exact:true}).click();await tools.locator('.focus-picker summary').click();await expect(page.locator('.teaching-focus')).toHaveCount(0);await expect(page.locator('.board-movement-path')).not.toHaveCount(0);await tools.getByLabel('Show Movement Paths').uncheck();await expect(page.locator('.board-movement-path')).toHaveCount(0);await expect(page.locator('.ghost-target')).toHaveCount(9);await tools.getByLabel('Show Targets').uncheck();await expect(page.locator('.ghost-target')).toHaveCount(0);
 await page.screenshot({path:'/tmp/phase7-presentation.png'});const stored=await (await page.request.get('/api/boards')).json();expect(stored.find(value=>value.id===saved.id).board).toEqual(board);
});

test('actual first-and-second CF situation parks the thrown ball beside the receiving chip',async({page,baseURL})=>{
 const {readFileSync}=await import('node:fs');const {fromSituation}=await import('../src/lib/plays/board.js');const situation=JSON.parse(readFileSync(new URL('./fixtures/cf-throw-situation.json',import.meta.url)));const board=fromSituation(situation);board.title=`CF render regression ${Date.now()}`;const play=compilePlay(board,{coachBoard:true}),leg=play.throws.at(-1);
 await login(page,baseURL);await loadBoard(page,baseURL,board);await page.getByRole('button',{name:'Present',exact:true}).click();await page.clock.install();const controls=page.getByRole('region',{name:'Presentation controls'});await controls.getByRole('button',{name:'Next Step',exact:true}).click();while(await controls.getByRole('status').textContent().then(text=>!text.includes('Throw 1 started')))await controls.getByRole('button',{name:'Next Step',exact:true}).click();await controls.getByRole('button',{name:'Play',exact:true}).click();
 const ball=page.locator('.board-ball');
 await expect(ball).toHaveCSS('border-top-color','rgb(169, 87, 96)');
 await expect(ball).toHaveCSS('background-image',/radial-gradient/);
 const receiver=page.getByRole('button',{name:`${leg.toId} token`,exact:true});
 async function expectBallClearance(){
  const b=await ball.boundingBox(),r=await receiver.boundingBox();
  const gap=Math.hypot(b.x+b.width/2-r.x-r.width/2,b.y+b.height/2-r.y-r.height/2)-(b.width+r.width)/2;
  expect(gap).toBeGreaterThan(4);
  expect(b.x+b.width/2).toBeLessThan(r.x+r.width/2);
  expect(b.y+b.height/2).toBeGreaterThan(r.y+r.height/2);
 }
 for(let i=0;i<7;i++){
  await page.clock.runFor(180);
  await expect(ball).toHaveClass(/is-thrown/);
 }
 await controls.getByRole('button',{name:'Pause',exact:true}).click();
 for(let i=0;i<play.steps.length&&!((await controls.getByRole('status').textContent()).includes('Final state'));i++){
  await controls.getByRole('button',{name:'Next Step',exact:true}).click();
 }
 await expect(controls.getByRole('status')).toContainText('Final state');
 await expectBallClearance();
});

 test('board pitch is visible before contact while optional lead routes run first',async({page,baseURL})=>{
 const board=demonstration();board.title=`Pitch preview ${Date.now()}`;
 board.runners.first={x:2200,y:1400};const lead={x:2100,y:1300};
 board.movements.first=[{path:[board.runners.first,lead],start:{event:'pre_pitch'}},{path:[lead,{x:1900,y:1100}],start:{event:'pitch_started'}}];
 const play=compilePlay(board,{coachBoard:true});await login(page,baseURL);await loadBoard(page,baseURL,board);
 await selectBoardStep(page,'Before the pitch');await page.getByText('Batter & runner movements',{exact:true}).click();await page.getByRole('button',{name:'first · Movement 1',exact:true}).click();
 await page.getByText('Timing options',{exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Start movement',exact:true})).toHaveValue('pre_pitch');
 await page.getByRole('button',{name:'Present',exact:true}).click();await page.clock.install();
 const controls=page.getByRole('region',{name:'Presentation controls'});await controls.getByRole('button',{name:'Play',exact:true}).click();
 await page.clock.runFor((play.pitchStart+250)*4);
 await expect(page.locator('.board-ball')).toHaveCount(1);await expect(page.locator('.board-hit-path')).toHaveCount(0);
 const ball=await page.locator('.board-ball').evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));
 const expected=frameAt(play,play.pitchStart+250).ball;
 expect(ball.x).toBeCloseTo(expected.x/3200*100,0);expect(ball.y).toBeCloseTo(expected.y/2133*100,0);
 await page.clock.runFor(1600);await expect(page.locator('.board-hit-path')).toHaveCount(1);
 });

test('Running tools save advances and preserve early movement when replacing custom running',async({page,baseURL})=>{
 const board=demonstration();board.title=`Running controls ${Date.now()}`;
 board.runners.first={x:2170,y:1304};const lead={x:2100,y:1250};
 board.movements.first=[{path:[board.runners.first,lead],start:{event:'pre_pitch'}},{path:[lead,{x:1800,y:1000}],start:{event:'contact'}}];
 await login(page,baseURL);const saved=await loadBoard(page,baseURL,board);
 await openRunnerAdvances(page);
 await page.getByRole('combobox',{name:'Hit result',exact:true}).selectOption('double');
 await expect(page.getByRole('combobox',{name:'Batter destination',exact:true})).toHaveValue('second');
 await expect(page.getByRole('combobox',{name:'Runner on first destination',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Use automatic running for first',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Runner on first destination',exact:true})).toBeEnabled();
 await page.getByRole('combobox',{name:'Runner on first destination',exact:true}).selectOption('home');
 await page.getByRole('button',{name:'Save Board',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Board saved.');
 const stored=(await (await page.request.get('/api/boards')).json()).find(item=>item.id===saved.id).board;
 expect(stored.running).toEqual({result:'double',destinations:{first:'home'}});expect(stored.movements.first).toHaveLength(1);expect(stored.movements.first[0].start.event).toBe('pre_pitch');
 await page.reload();await openLibraryPlay(page,'board',saved.id,board.title);await openRunnerAdvances(page);
 await expect(page.getByRole('combobox',{name:'Hit result',exact:true})).toHaveValue('double');await expect(page.getByRole('combobox',{name:'Runner on first destination',exact:true})).toHaveValue('home');
 await page.getByRole('button',{name:'Present',exact:true}).click();const controls=page.getByRole('region',{name:'Presentation controls'}),play=compilePlay(stored,{coachBoard:true});
 for(let i=1;i<play.steps.length;i++)await controls.getByRole('button',{name:'Next Step',exact:true}).click();
 const batter=await tokenPosition(page,'batter'),runner=await tokenPosition(page,'first');
 expect(batter.x).toBeCloseTo(1572/3200*100);expect(batter.y).toBeCloseTo(854/2133*100);
 expect(runner.x).toBeCloseTo(1577/3200*100);expect(runner.y).toBeCloseTo(1734/2133*100);
});

test('throws stay straight and hand off on the same side of each chip',async()=>{
 const {positionThrownBall,tokenMetrics}=await import('../src/lib/plays/token-presentation.js');
 const a={x:1200,y:1300}, b={x:2000,y:650}, c={x:900,y:550};
 for(const width of [360,1200]){
  const metrics=tokenMetrics(width,width*2133/3200);
  const position=ball=>positionThrownBall({ball,ballThrow:true},metrics);
  const receive=position(b), release=position(a);
  expect(receive.x).toBeLessThan(b.x);
  expect(receive.y).toBeGreaterThan(b.y);
  for(const to of [b,c,{x:a.x-4,y:a.y+4},a]){
   const end=position(to);
   for(const progress of [0,0.25,0.5,0.75,1]){
    const mid=position({x:a.x+(to.x-a.x)*progress,y:a.y+(to.y-a.y)*progress});
    expect(mid.x).toBeCloseTo(release.x+(end.x-release.x)*progress);
    expect(mid.y).toBeCloseTo(release.y+(end.y-release.y)*progress);
   }
  }
 }
});

test('airborne hits fielded on the ground touch down, bounce, and settle before pickup',()=>{
 for(const type of ['line_drive','fly_ball','pop_fly']){
  const board=demonstration();
  const destination={x:1500,y:900};
  board.battedBall={...board.battedBall,type,destination,fielding:'ground',fielder:'SS'};
  board.movements.SS=[{path:[board.defenders.SS,destination],start:{event:'contact'},durationMs:250}];
  for(const coachBoard of [true,false]){
   const play=compilePlay(board,{coachBoard,showHitFlight:true});
   const land=play.contactTime+play.ballDuration;
   const bounceDuration=hitBounceDuration(type);
   const touchdown=frameAt(play,land);
   expect(touchdown.ball).toEqual(touchdown.ballShadow);
   expect(touchdown.ball).not.toEqual(destination);
   expect(touchdown.fieldingLabel).toBe('');
   const bounced=frameAt(play,land+bounceDuration/2);
   expect(bounced.ball.y).toBeLessThan(bounced.ballShadow.y);
   const settled=frameAt(play,land+bounceDuration);
   expect(settled.ball).toEqual(destination);
   expect(settled.ballShadow).toBeNull();
   expect(settled.positions.SS).not.toEqual(destination);
   expect(play.fieldingTime).toBeGreaterThan(land+bounceDuration);
   expect(frameAt(play,play.fieldingTime).positions.SS).toEqual(destination);
   expect(play.throws[0].start).toBeGreaterThanOrEqual(play.fieldingTime);
  }
  expect(board.movements.SS[0].durationMs).toBe(250);
  const catchPlay=compilePlay({...board,battedBall:{...board.battedBall,fielding:'caught'}},{coachBoard:true});
  expect(catchPlay.fieldingTime).toBe(catchPlay.contactTime+catchPlay.ballDuration);
  expect(catchPlay.caught).toBe(true);
  expect(frameAt(catchPlay,catchPlay.fieldingTime+50).ballShadow).toBeNull();
 }
});


test('S01 ground pickup follows its bounce and its shorter relay retains a transfer',()=>{
 const situation=JSON.parse(readFileSync(new URL('../situations.json',import.meta.url),'utf8')).find(item=>item.key==='BD-01');
 for(const coachBoard of [true,false]){
  const board=fromSituation(situation,{coachBoard});
  const play=compilePlay(board,{coachBoard,showHitFlight:true});
  const landed=play.contactTime+play.ballDuration;
  const settled=landed+hitBounceDuration(board.battedBall);
  expect(play.fieldingWarning).toBe('');
  expect(play.fieldingTime).toBeGreaterThan(settled);
  expect(frameAt(play,settled).positions.LF).not.toEqual(board.battedBall.destination);
  const bounce=frameAt(play,landed+hitBounceDuration(board.battedBall)/2);
  expect(bounce.ballShadow).not.toBeNull();
  expect(Math.hypot(bounce.ball.x-bounce.positions.LF.x,bounce.ball.y-bounce.positions.LF.y)).toBeGreaterThan(50);
  expect(play.throws[0].start-play.fieldingTime).toBe(90);
  expect(play.throws[1].start-(play.throws[0].start+play.throws[0].duration)).toBe(70);
  expect(play.throws[1].duration).toBeLessThan(play.throws[0].duration);
  expect(boardAnimation(board).throwTimings).toEqual(situation.boardAnimation.throwTimings);
  expect(importBoardFile(exportBoardFile(board)).throwTimings).toEqual(board.throwTimings);
  expect(syncSituationAnimation(situation).boardAnimation.throwTimings).toEqual(board.throwTimings);
  expect(validateBoard({...board,throwTimings:[{from:'LF',to:'SS',durationMs:-1,transferMs:0}]})).not.toEqual([]);
 }
});


test('runner display spacing keeps occupied-base chips legible without mutating routes',async()=>{
 const {positionRunnerChip,tokenMetrics}=await import('../src/lib/plays/token-presentation.js');
 const {BASES_NATIVE}=await import('../src/lib/plays/field.js');
 for(const width of [1000,1800]){
  const metrics=tokenMetrics(width,width*2133/3200);
  for(const [base,id] of [['first','1B'],['second','2B'],['third','3B']]){
   const point={...BASES_NATIVE[base]},positions={[id]:{...point}};
   const before=JSON.stringify({point,positions});
   const shown=positionRunnerChip(point,positions,metrics);
   const separation=Math.hypot((shown.x-point.x)*metrics.width/3200,(shown.y-point.y)*metrics.height/2133);
   expect(separation).toBeGreaterThanOrEqual((metrics.defender+metrics.runner)/2+5);
   expect(JSON.stringify({point,positions})).toBe(before);
   const midfield={x:1570,y:1240};expect(positionRunnerChip(midfield,positions,metrics)).toEqual(midfield);
  }
 }
});
