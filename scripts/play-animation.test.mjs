import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBoard,upgradeBoard,validateBoard,toSituation,fromSituation} from '../src/lib/plays/board.js';
import {reconcileSegments} from '../src/lib/plays/segments.js';
import {compilePlay,frameAt,createPlayback} from '../src/lib/plays/animation.js';
const segment=(from,to,event='contact',throwIndex)=>({path:[{...from},{...to}],start:{event,...(throwIndex?{throwIndex}:{})}});
function fixture(){const b=newBoard();b.battedBall={type:'ground_ball',start:{x:1577,y:1734},destination:{x:1300,y:900}};b.playSeq=['SS','2B','1B'];return b;}

test('v1 loads non-destructively as one contact segment and legacy Situations use direct paths',()=>{
 const b=fixture();b.version=1;b.movements.SS=[{path:[b.defenders.SS,{x:1300,y:900}]}];const before=JSON.stringify(b);
 const upgraded=upgradeBoard(b);assert.equal(upgraded.version,2);assert.equal(upgraded.movements.SS[0].start.event,'contact');assert.equal(JSON.stringify(b),before);assert.deepEqual(validateBoard(b),[]);assert.doesNotThrow(()=>compilePlay(b));
 const s={key:'legacy',title:'Legacy',starts:b.defenders,outs:0,runnersOn:{},targets:{SS:{x:1300,y:900,tol:69}},hit:b.battedBall.destination,playSeq:b.playSeq,hitType:'grounder'};
 const loaded=fromSituation(s);assert.deepEqual(loaded.movements.SS[0].path,[b.defenders.SS,{x:1300,y:900}]);assert.doesNotThrow(()=>compilePlay(loaded));
});
test('fielding starts subsequent movement while backup movement continues independently',()=>{
 const b=fixture();const middle={x:1300,y:900},end={x:1550,y:860};
 b.movements.SS=[segment(b.defenders.SS,middle),segment(middle,end,'ball_fielded')];
 b.movements.CF=[segment(b.defenders.CF,{x:3000,y:2100})];
 const play=compilePlay(b),fielded=play.events.find(e=>e.type==='ball_fielded').time;
 assert.equal(fielded,1400);assert.equal(play.tracks.find(t=>t.id==='SS'&&t.index===1).start,fielded);
 assert.ok(play.throws[0].start<play.tracks.find(t=>t.id==='CF').duration);
 assert.deepEqual(frameAt(play,fielded).positions.SS,middle);
 assert.deepEqual(frameAt(play,play.duration).positions.SS,end);
 assert.equal(frameAt(play,play.duration).arrows.length,2);
});
test('specific throw start and receive events coordinate overlapping movement and live receivers',()=>{
 const b=fixture(),end1={x:1400,y:900},end2={x:1500,y:850};
 b.movements.SS=[segment(b.defenders.SS,end1),segment(end1,end2,'throw_received',1)];
 b.movements['2B']=[segment(b.defenders['2B'],{x:1600,y:850},'throw_started',1)];
 const play=compilePlay(b),received=play.events.find(e=>e.id==='throw_received:1').time;
 assert.equal(play.tracks.find(t=>t.id==='SS'&&t.index===1).start,received);
 assert.equal(play.tracks.find(t=>t.id==='2B').start,play.throws[0].start);
 assert.deepEqual(play.throws[0].to,frameAt(play,received).positions['2B']);
 assert.ok(play.throws[1].start>=play.tracks.find(t=>t.id==='2B').start+play.tracks.find(t=>t.id==='2B').duration);
});
test('unavailable events, discontinuous paths, and dependency cycles are rejected',()=>{
 const b=fixture();b.movements.SS=[segment(b.defenders.SS,{x:1300,y:900},'throw_received',1),segment({x:1300,y:900},{x:1400,y:900},'contact')];
 assert.throws(()=>compilePlay(b),/circular dependency/);
 b.movements.SS[0].start.throwIndex=99;assert.match(validateBoard(b).join(),/unavailable throw/);
 b.movements.SS[0].start={event:'contact'};b.movements.SS[1].path[0]={x:20,y:20};assert.match(validateBoard(b).join(),/must start/);
 reconcileSegments(b,'SS');assert.equal(validateBoard(b).length,0);
});
test('editing or deleting earlier segments reconnects later starts without flattening curves',()=>{
 const b=fixture(),a={x:1300,y:900},c={x:1500,y:850};
 b.movements.SS=[segment(b.defenders.SS,a),{path:[a,{x:1200,y:650},c],start:{event:'previous_movement'}},segment(c,{x:1600,y:900},'previous_movement')];
 b.movements.SS[0].path[1]={x:1400,y:1000};reconcileSegments(b,'SS');assert.deepEqual(b.movements.SS[1].path[0],{x:1400,y:1000});assert.deepEqual(b.movements.SS[1].path[1],{x:1200,y:650});
 b.movements.SS.splice(1,1);reconcileSegments(b,'SS');assert.deepEqual(b.movements.SS[1].path[0],b.movements.SS[0].path.at(-1));assert.doesNotThrow(()=>compilePlay(b));
});
test('segmented conversion retains all paths while correctness uses only the final endpoint',()=>{
 const b=fixture(),middle={x:1300,y:900},end={x:1500,y:850};b.movements.SS=[segment(b.defenders.SS,middle),segment(middle,end,'ball_fielded')];
 const s=toSituation(b,{playOutcome:{result:'single',batterResult:'first',outsRecorded:0,reviewStatus:'ready'},runnerOutcomes:[]});
 assert.equal(s.boardAnimation.version,2);assert.deepEqual({x:s.targets.SS.x,y:s.targets.SS.y},end);assert.equal(s.boardAnimation.movements.SS.length,2);assert.deepEqual(fromSituation(s).movements.SS,b.movements.SS);
 // Later Situation Builder edits remain authoritative for solution correctness.
 s.targets.SS.x=1600;assert.equal(fromSituation(s).movements.SS.at(-1).path.at(-1).x,1600);
});
test('snapshots, steps, pause, speed, reduced motion and replay never mutate authored data',()=>{
 const b=fixture();b.movements.SS=[segment(b.defenders.SS,{x:1300,y:900})];const before=JSON.stringify(b),play=compilePlay(b);
 let now=0,next=null,frame,completed=0;
 const controller=createPlayback(play,value=>frame=value,()=>{}, {now:()=>now,requestFrame:fn=>{next=fn;return 1;},cancelFrame:()=>next=null,onComplete:()=>completed++});
 controller.play();now=100;next(now);assert.equal(frame.time,100);controller.setSpeed(2);now=200;next(now);assert.equal(frame.time,300);
 controller.pause();assert.equal(next,null);controller.restart();assert.deepEqual(frame.positions.SS,b.defenders.SS);controller.step(1);assert.equal(frame.time,play.steps[1]);controller.step(-1);assert.equal(frame.time,0);
 for(const time of play.steps)assert.deepEqual(frameAt(play,time),frameAt(play,time));
 const reduced=createPlayback(play,value=>frame=value,()=>{}, {reducedMotion:true,onComplete:()=>completed++});reduced.play();assert.equal(frame.time,play.duration);assert.equal(completed,1);reduced.restart();assert.equal(frame.time,0);assert.equal(JSON.stringify(b),before);
});


test('runner segments wait independently for throws and repeated throw routes remain distinct',()=>{
 const b=fixture();b.runners.first={x:2200,y:1500};const middle={x:1900,y:1200},end={x:1550,y:900};
 b.movements.first=[segment(b.runners.first,middle),segment(middle,end,'throw_received',1)];
 b.playSeq=['SS','2B','SS','2B'];const play=compilePlay(b),track=play.tracks.find(t=>t.id==='first'&&t.index===1);
 assert.equal(track.start,play.throws[0].start+play.throws[0].duration);
 assert.deepEqual(frameAt(play,track.start).positions.first,middle);
 assert.deepEqual(frameAt(play,play.duration).positions.first,end);
 assert.notDeepEqual(play.throws[0].route,play.throws[2].route);
 assert.equal(frameAt(play,play.duration).arrows.length,3);
});
