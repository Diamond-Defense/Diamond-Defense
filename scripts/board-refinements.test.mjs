import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBoard,clone,validateBoard} from '../src/lib/plays/board.js';
import {compilePlay,frameAt,sampleBattedBall} from '../src/lib/plays/animation.js';
import {emptyHistory,recordHistory,stepHistory} from '../src/lib/plays/history.js';
function fixture(){const b=newBoard();b.battedBall={fielder:'SS',type:'line_drive',start:clone(b.runners.batter),destination:{x:1300,y:900}};b.playSeq=['SS','2B'];b.movements.SS=[{path:[b.defenders.SS,clone(b.battedBall.destination)],start:{event:'contact'},durationMs:5000}];return b;}
test('board fielding waits for arrival and schedules later movement and throws from that event',()=>{
 const b=fixture(),snapshot=JSON.stringify(b);b.movements.C=[{path:[b.defenders.C,{x:1500,y:1600}],start:{event:'ball_fielded'}}];
 const play=compilePlay(b,{coachBoard:true}),fielded=play.events.find(e=>e.type==='ball_fielded').time;
 assert.equal(fielded,play.contactTime+5000);assert.equal(play.ballDuration,450);assert.equal(play.fielder,'SS');
 assert.equal(play.tracks.find(t=>t.id==='C').start,fielded);assert.ok(play.throws[0].start>=fielded);
 const before=frameAt(play,fielded-100);assert.ok(!before.events.some(e=>e.type==='ball_fielded'));assert.notDeepEqual(before.positions.SS,b.battedBall.destination);
 const arrived=frameAt(play,play.contactTime+play.ballDuration);
 assert.deepEqual(arrived.ball,sampleBattedBall(b.battedBall,play.ballDuration,play.ballDuration,{grounded:true,caught:false}).ball);
 assert.ok(!arrived.events.some(e=>e.type==='ball_fielded'));
 const runner=play.tracks.find(track=>track.id==='batter');
 assert.equal(runner.start,play.contactTime);
 assert.ok(play.ballDuration<runner.duration);
 assert.deepEqual(before.ball,b.battedBall.destination);
 const caught=frameAt(play,fielded);assert.deepEqual(caught.positions.SS,caught.ball);
 delete b.movements.C;assert.equal(JSON.stringify(b),snapshot);
 const normal=compilePlay(b);assert.equal(normal.ballDuration,900);assert.equal(normal.events.find(e=>e.type==='ball_fielded').time,900);
});
test('short fielder routes retain minimum flight and explicit fielder works without throws',()=>{
 const b=fixture();b.movements.SS[0].durationMs=250;
 assert.equal(compilePlay(b,{coachBoard:true}).ballDuration,450);
 b.playSeq=[];b.battedBall.fielder='SS';b.movements.SS[0].durationMs=2500;
 const delayed=compilePlay(b,{coachBoard:true});
 assert.equal(delayed.ballDuration,450);
 assert.equal(delayed.fieldingTime,delayed.contactTime+2500);
 b.battedBall.fielder='bad';assert.match(validateBoard(b).join(),/fielder/);
});
test('movement after fielding cannot become a circular fielding dependency and mismatches are explained',()=>{
 const b=fixture();b.movements.SS[0].start={event:'ball_fielded'};
 const play=compilePlay(b,{coachBoard:true});assert.match(play.fieldingWarning,/before it is fielded/);assert.equal(play.ballDuration,450);
 b.movements.SS[0].start={event:'contact'};b.movements.SS[0].path[1]={x:1800,y:1000};assert.match(compilePlay(b,{coachBoard:true}).fieldingWarning,/ends away/);
});
test('history restores exact snapshots, ignores duplicate states and clears redo after an edit',()=>{
 let h=recordHistory(emptyHistory(),'original');h=recordHistory(h,'route');h=recordHistory(h,'timing');
 assert.equal(recordHistory(h,'timing'),h);h=stepHistory(h,-1);assert.equal(h.entries[h.index],'route');h=stepHistory(h,1);assert.equal(h.entries[h.index],'timing');
 h=stepHistory(h,-1);h=recordHistory(h,'new route');assert.deepEqual(h.entries,['original','route','new route']);assert.equal(stepHistory(h,1),h);
});
test('history remains bounded and cannot travel beyond its endpoints',()=>{
 let h=emptyHistory();for(let i=0;i<60;i++)h=recordHistory(h,String(i));assert.equal(h.entries.length,50);assert.equal(h.entries[0],'10');
 for(let i=0;i<60;i++)h=stepHistory(h,-1);assert.equal(h.index,0);assert.equal(stepHistory(h,-1),h);
});

test('board throws use quicker steady flight while normal app keeps existing throw timing',()=>{
 const b=fixture(),play=compilePlay(b,{coachBoard:true}),leg=play.throws[0];
 assert.equal(leg.duration,350);assert.equal(compilePlay(b).throws[0].duration,700);
 for(const progress of [.25,.5,.75]){
  const frame=frameAt(play,leg.start+leg.duration*progress);
  assert.equal(frame.ballThrow.index,leg.index);
  assert.ok(Math.abs(frame.ball.x-(leg.from.x+(leg.to.x-leg.from.x)*progress))<1e-8);
  assert.ok(Math.abs(frame.ball.y-(leg.from.y+(leg.to.y-leg.from.y)*progress))<1e-8);
 }
});

test('Coach Board shows a catch at arrival and a late catch becomes a ground pickup',()=>{
 const b=fixture();
 b.battedBall.type='pop_fly';
 b.movements.SS[0].durationMs=500;
 const play=compilePlay(b,{coachBoard:true});
 const mid=frameAt(play,play.contactTime+play.ballDuration/2);
 assert.ok(mid.ball.y<mid.ballShadow.y);
 assert.deepEqual(mid.hitTrail.at(-1),mid.ball);
 assert.equal(frameAt(play,play.fieldingTime).fieldingLabel,'Caught by SS');
 assert.ok(play.throws[0].start>=play.fieldingTime);

 b.movements.SS[0].durationMs=5000;
 const late=compilePlay(b,{coachBoard:true});
 assert.match(late.fieldingWarning,/after the ball lands/);
 assert.deepEqual(frameAt(late,late.contactTime+late.ballDuration).ball,b.battedBall.destination);
 assert.equal(frameAt(late,late.fieldingTime).fieldingLabel,'Fielded by SS');
 assert.equal(frameAt(compilePlay(b),200).hitTrail.length,0);
});
