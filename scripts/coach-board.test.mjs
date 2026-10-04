import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBoard,validateBoard,cleanPath,fromSituation,toSituation,upgradeBoard} from '../src/lib/plays/board.js';
import {compilePlay,frameAt,pointOnPath} from '../src/lib/plays/animation.js';

test('incomplete boards are valid independently of Situation conversion',()=>{
 const b=newBoard();assert.deepEqual(validateBoard(b),[]);
 assert.throws(()=>toSituation(b,{}),/destination/);
 b.movements.P=[{path:[b.defenders.P,{x:1600,y:1300}]}];assert.deepEqual(validateBoard(b),[]);
 b.movements.P[0].path[1].x=Infinity;assert.match(validateBoard(b).join(),/movement/);
});
test('sampled curves retain geometry, concurrent tracks, and authored reset state',()=>{
 const b=newBoard();b.runners.first={x:2170,y:1304};
 const points=[{x:1202,y:935},{x:1200,y:700},{x:1400,y:650},{x:1572,y:854}];
 b.movements.SS=[{path:cleanPath(points)}];b.movements.first=[{path:[b.runners.first,{x:1572,y:854}]}];
 b.battedBall={type:'fly_ball',start:{x:1577,y:1734},destination:{x:1400,y:650}};b.playSeq=['SS','2B','1B'];
 const before=JSON.stringify(b),play=compilePlay(b),mid=frameAt(play,play.tracks.find(t=>t.id==='SS').duration/2);
 assert.ok(mid.positions.SS.y<800);assert.notDeepEqual(mid.positions.first,b.runners.first);assert.notDeepEqual(mid.ball,b.battedBall.start);assert.equal(mid.arrows.length,0);
 assert.deepEqual(frameAt(play,0).positions.SS,b.defenders.SS);assert.equal(JSON.stringify(b),before);
 assert.equal(frameAt(play,play.duration).arrows.length,2);assert.deepEqual(frameAt(play,play.duration).positions.SS,points.at(-1));
 assert.deepEqual(pointOnPath([{x:0,y:0},{x:0,y:0}],0.5),{x:0,y:0});
});
test('all hit types differ in default flight timing and remain structured data',()=>{
 const durations=['ground_ball','line_drive','fly_ball','pop_fly'].map(type=>{const b=newBoard();b.battedBall={type,start:{x:0,y:0},destination:{x:500,y:500}};return compilePlay(b).ballDuration;});assert.equal(new Set(durations).size,4);
});
test('legacy Situation adapter and conversion preserve targets and optional instructional metadata',()=>{
 const b=newBoard();const s={key:'test',title:'Test',outs:1,starts:b.defenders,targets:Object.fromEntries(Object.entries(b.defenders).map(([id,p])=>[id,{...p,tol:69}])),runnersOn:{first:true,second:false,third:false},hit:{x:700,y:700},hitType:'grounder',playSeq:['SS','1B'],playSeq2:['1B','C']};
 const loaded=fromSituation(s);assert.deepEqual(validateBoard(loaded),[]);assert.equal(loaded.movements.SS[0].path.length,2);
 loaded.movements.SS=[{path:[loaded.defenders.SS,{x:1100,y:700},{x:1300,y:800}]}];
 const converted=toSituation(loaded,{playOutcome:{result:'single',batterResult:'first',outsRecorded:0,reviewStatus:'ready'},runnerOutcomes:[]});
 assert.equal(converted.targets.SS.x,1300);assert.equal(converted.boardAnimation.movements.SS[0].path.length,3);assert.deepEqual(converted.playSeq2,s.playSeq2);assert.notEqual(converted.key,s.key);assert.deepEqual(fromSituation(converted).movements,upgradeBoard(loaded).movements);
});

test('shared throw geometry trims chips while retaining short and offset legs', async()=>{
 const {throwRoute}=await import('../src/lib/plays/throws.js');
 assert.deepEqual(throwRoute({x:0,y:0},{x:200,y:0},20),{from:{x:25,y:0},to:{x:170,y:0}});
 assert.deepEqual(throwRoute({x:0,y:0},{x:10,y:0},20,{x:3,y:4}),{from:{x:3,y:4},to:{x:13,y:4}});
});
