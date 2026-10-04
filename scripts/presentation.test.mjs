import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBoard,fromSituation} from '../src/lib/plays/board.js';
import {compilePlay,frameAt,createPlayback} from '../src/lib/plays/animation.js';
import {presentationStatus} from '../src/lib/plays/presentation.js';
test('presentation describes simultaneous baseball event snapshots without artificial steps',()=>{
 const board=newBoard();board.battedBall={type:'line_drive',start:{x:1500,y:1800},destination:{x:1200,y:900}};board.playSeq=['SS','2B','1B'];
 const before=JSON.stringify(board),play=compilePlay(board);
 assert.equal(presentationStatus(play,frameAt(play,0)),'Starting alignment');
 assert.match(presentationStatus(play,frameAt(play,900)),/Ball fielded.*Throw 1 started/);
 assert.match(presentationStatus(play,frameAt(play,1600)),/Throw 1 received.*Throw 2 started/);
 assert.match(presentationStatus(play,frameAt(play,play.duration)),/Final state/);
 assert.equal(JSON.stringify(board),before);
});
test('incomplete Board and legacy Situation present through the same engine without conversion',()=>{
 const board=newBoard();assert.equal(compilePlay(board).duration,0);assert.equal(presentationStatus(compilePlay(board),frameAt(compilePlay(board),0)),'Starting alignment');
 const situation={key:'legacy-present',title:'Legacy',outs:0,runnersOn:{},starts:board.defenders,targets:{SS:{x:1300,y:900,tol:65}},hit:{x:1200,y:800},playSeq:['SS','1B'],batterAdvance:1};
 const before=JSON.stringify(situation),play=compilePlay(fromSituation(situation));assert.ok(play.tracks.some(t=>t.id==='SS'));assert.equal(play.throws.length,1);assert.equal(JSON.stringify(situation),before);
});
test('presentation pause, resume, mixed stepping and replay share deterministic snapshots',()=>{
 const board=newBoard();board.battedBall={type:'fly_ball',start:{x:1500,y:1800},destination:{x:1100,y:800}};board.playSeq=['LF','SS'];const play=compilePlay(board);
 let now=0,next,frame;const control=createPlayback(play,value=>frame=value,()=>{}, {now:()=>now,requestFrame:fn=>{next=fn;return 1;},cancelFrame:()=>next=null});
 control.play();now=100;next(now);control.pause();const frozen=frame.time;now=1000;control.play();now=1100;next(now);assert.equal(frame.time,frozen+100);control.step(1);assert.deepEqual(frame,frameAt(play,play.steps.find(t=>t>200)));control.step(-1);assert.deepEqual(frame,frameAt(play,0));control.play();now=1200;next(now);control.restart();assert.deepEqual(frame,frameAt(play,0));control.dispose();assert.equal(next,null);
});

test('teaching playback slows the whole event clock fourfold, with speed and reduced motion intact',async()=>{
 const {TEACHING_PLAYBACK_RATE}=await import('../src/lib/plays/animation.js');
 const board=newBoard();board.battedBall={type:'ground_ball',start:{x:1500,y:1800},destination:{x:1200,y:900}};board.playSeq=['SS','1B'];const play=compilePlay(board);
 let now=0,next,frame;const control=createPlayback(play,value=>frame=value,()=>{}, {rate:TEACHING_PLAYBACK_RATE,now:()=>now,requestFrame:fn=>{next=fn;return 1;},cancelFrame:()=>next=null});
 control.play();now=1000;next(now);assert.equal(frame.time,250);control.setSpeed(0.5);now=2000;next(now);assert.equal(frame.time,375);control.setSpeed(2);now=3000;next(now);assert.equal(frame.time,875);control.step(1);assert.equal(frame.time,play.ballDuration);control.restart();assert.equal(frame.time,0);control.dispose();
 const reduced=createPlayback(play,value=>frame=value,()=>{}, {rate:TEACHING_PLAYBACK_RATE,reducedMotion:true});reduced.play();assert.equal(frame.time,play.duration);assert.equal(board.playSeq.length,2);
});

test('movement trails show only distance already traveled through bends and waits',async()=>{
 const {measurePath,traveledPath,pointOnPath}=await import('../src/lib/plays/animation.js');const path=[{x:0,y:0},{x:100,y:0},{x:100,y:100}],track={path,geometry:measurePath(path),start:500,duration:1000};
 assert.deepEqual(traveledPath(track,500),[]);assert.deepEqual(traveledPath(track,750),[{x:0,y:0},{x:50,y:0}]);assert.deepEqual(traveledPath(track,1250),[{x:0,y:0},{x:100,y:0},{x:100,y:50}]);assert.deepEqual(traveledPath(track,2000),path);assert.deepEqual(traveledPath(track,1250).at(-1),pointOnPath(path,.75));
});

test('CF to 1B throw stays straight when crossing 2B and a runner',()=>{
 const board=newBoard();board.defenders.CF={x:1600,y:450};board.defenders['1B']={x:1600,y:1250};board.defenders['2B']={x:1600,y:950};board.runners.second={x:1600,y:950};board.battedBall={type:'line_drive',start:{x:1600,y:1800},destination:board.defenders.CF};board.playSeq=['CF','1B'];
 const play=compilePlay(board),leg=play.throws[0];let previous=-Infinity;
 for(let i=1;i<=20;i++){const frame=frameAt(play,leg.start+leg.duration*i/20);assert.equal(frame.ball.x,1600);assert.ok(frame.ball.y>=previous);previous=frame.ball.y;assert.ok(frame.ball.y>=leg.route.from.y&&frame.ball.y<=leg.route.to.y);}
});
