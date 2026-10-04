import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBoard,cleanPath,validateBoard} from '../src/lib/plays/board.js';
import {compilePlay,frameAt} from '../src/lib/plays/animation.js';

test('board pitch waits for optional leads, then concurrent pitch movement precedes contact',()=>{
 const b=newBoard();b.runners.first={x:2200,y:1400};
 b.battedBall={type:'line_drive',start:{x:1577,y:1734},destination:{x:1600,y:500}};
 const lead={x:2100,y:1300},advance={x:1900,y:1100};
 b.movements.first=[{path:[b.runners.first,lead],start:{event:'pre_pitch'}},{path:[lead,advance],start:{event:'pitch_started'}}];
 b.movements.P=[{path:[b.defenders.P,{x:b.defenders.P.x+20,y:b.defenders.P.y+20}],start:{event:'pitch_started'}}];
 assert.deepEqual(validateBoard(b),[]);
 const play=compilePlay(b,{coachBoard:true});
 assert.equal(play.pitchStart,play.tracks[0].duration);
 assert.equal(play.contactTime,play.pitchStart+700);
 assert.equal(play.tracks[1].start,play.pitchStart);
 assert.equal(frameAt(play,play.pitchStart-1).ball,null);
 assert.deepEqual(frameAt(play,play.pitchStart).ball,b.defenders.P);
 const midway=frameAt(play,play.pitchStart+350).ball;
 assert.equal(midway.x,(b.defenders.P.x+b.battedBall.start.x)/2);
 assert.equal(midway.y,(b.defenders.P.y+b.battedBall.start.y)/2);
 assert.deepEqual(frameAt(play,play.contactTime).ball,b.battedBall.start);
 assert.deepEqual(frameAt(play,play.duration).positions.first,{x:1572,y:854});
 // The normal app retains its contact-first timeline, even with instructional metadata.
 assert.equal(compilePlay(b).contactTime,0);
});
test('existing board routes retain contact timing after the board-only pitch',()=>{
 const b=newBoard();b.battedBall={type:'ground_ball',start:{x:1577,y:1734},destination:{x:1300,y:900}};
 b.movements.SS=[{path:[b.defenders.SS,{x:1300,y:900}]}];
 assert.equal(compilePlay(b).tracks[0].start,0);
 assert.equal(compilePlay(b,{coachBoard:true}).tracks[0].start,700);
});
test('drawn routes smooth jitter while retaining endpoints, curvature and bounds',()=>{
 const points=Array.from({length:160},(_,i)=>({x:100+i*4,y:300+Math.sin(i/159*Math.PI)*200+(i%2?8:-8)}));
 const path=cleanPath(points);
 assert.deepEqual(path[0],points[0]);assert.deepEqual(path.at(-1),points.at(-1));
 assert.ok(path.length<=512);assert.ok(Math.max(...path.map(p=>p.y))>480);
 const variation=p=>p.slice(1,-1).reduce((sum,v,i)=>sum+Math.abs(p[i].y-2*v.y+p[i+2].y),0);
 assert.ok(variation(path)<variation(points));
 assert.deepEqual(cleanPath([points[0],points.at(-1)]),[points[0],points.at(-1)]);
});

test('pitch and hit remain continuous across contact with no stationary launch interval',()=>{
 const b=newBoard();b.runners.batter={x:1577,y:1734};
 b.battedBall={type:'line_drive',start:{...b.runners.batter},destination:{x:1700,y:500}};
 const play=compilePlay(b,{coachBoard:true}),contact=play.contactTime;
 const before=frameAt(play,contact-1).ball,at=frameAt(play,contact).ball,after=frameAt(play,contact+1).ball;
 assert.deepEqual(at,b.battedBall.start);
 assert.ok(Math.hypot(before.x-at.x,before.y-at.y)<3);
 assert.ok(Math.hypot(after.x-at.x,after.y-at.y)<3);
 for(let offset=16;offset<100;offset+=16){
  const previous=frameAt(play,contact+offset-16).ball,next=frameAt(play,contact+offset).ball;
  assert.ok(Math.hypot(next.x-previous.x,next.y-previous.y)>0);
 }
});
