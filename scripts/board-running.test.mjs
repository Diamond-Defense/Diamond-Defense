import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBoard,clone,validateBoard} from '../src/lib/plays/board.js';
import {BASES_NATIVE} from '../src/lib/plays/field.js';
import {compilePlay,frameAt} from '../src/lib/plays/animation.js';
import {hasCustomRunning,useAutomaticRunning} from '../src/lib/plays/running.js';
function fixture(){const b=newBoard();b.battedBall={type:'line_drive',start:clone(BASES_NATIVE.home),destination:{x:1600,y:500}};for(const base of ['first','second','third'])b.runners[base]=clone(BASES_NATIVE[base]);return b;}
for(const [result,destinations] of Object.entries({single:['first','second','third','home'],double:['second','third','home','home'],triple:['third','home','home','home'],home_run:['home','home','home','home']}))test(`${result} generates automatic advances only in Coach Board`,()=>{
 const b=fixture();b.running.result=result;const snapshot=JSON.stringify(b),play=compilePlay(b,{coachBoard:true});
 const final=frameAt(play,play.duration);
 for(const [i,id] of ['batter','first','second','third'].entries()){
  assert.deepEqual(final.positions[id],BASES_NATIVE[destinations[i]]);
  const track=play.tracks.find(t=>t.id===id);assert.equal(track.start,play.contactTime);assert.equal(track.automatic,true);
 }
 assert.equal(JSON.stringify(b),snapshot);assert.equal(compilePlay(b).tracks.length,0);
});
test('custom routes override suggested advances and replacement retains the lead',()=>{
 const b=fixture(),lead={x:2100,y:1250},custom={x:1900,y:1000};
 b.movements.first=[{path:[b.runners.first,lead],start:{event:'pre_pitch'}},{path:[lead,custom],start:{event:'contact'}}];
 let play=compilePlay(b,{coachBoard:true});assert.ok(hasCustomRunning(b,'first'));assert.equal(play.tracks.filter(t=>t.id==='first'&&t.automatic).length,0);assert.deepEqual(frameAt(play,play.duration).positions.first,custom);
 useAutomaticRunning(b,'first');assert.equal(b.movements.first.length,1);assert.ok(!hasCustomRunning(b,'first'));
 play=compilePlay(b,{coachBoard:true});assert.deepEqual(play.tracks.find(t=>t.id==='first'&&t.automatic).path[0],lead);
});
test('ongoing during-pitch lead transitions continuously into automatic running at contact',()=>{
 const b=fixture();b.movements.first=[{path:[b.runners.first,{x:1900,y:1000}],start:{event:'pitch_started'}}];
 const play=compilePlay(b,{coachBoard:true}),contact=play.contactTime,route=play.tracks.find(t=>t.id==='first'&&t.automatic);
 const before=frameAt(play,contact-1).positions.first,at=frameAt(play,contact).positions.first;
 assert.deepEqual(route.path[0],at);assert.ok(Math.hypot(before.x-at.x,before.y-at.y)<2);
 assert.deepEqual(frameAt(play,play.duration).positions.first,BASES_NATIVE.second);
});
test('destinations allow scoring on a single, holds and attempted outs',()=>{
 const b=fixture();b.running.destinations={second:'home',third:'hold',batter:'out'};
 assert.deepEqual(validateBoard(b),[]);const play=compilePlay(b,{coachBoard:true}),final=frameAt(play,play.duration);
 assert.deepEqual(final.positions.second,BASES_NATIVE.home);assert.deepEqual(final.positions.third,BASES_NATIVE.third);
 assert.notDeepEqual(final.positions.batter,BASES_NATIVE.home);assert.notDeepEqual(final.positions.batter,BASES_NATIVE.first);
 b.running.destinations.second='first';assert.ok(validateBoard(b).length);
});
test('legacy boards gain a batter only in board playback and incomplete boards do not run',()=>{
 const b=fixture();delete b.runners.batter;const play=compilePlay(b,{coachBoard:true});assert.ok(play.tracks.some(t=>t.id==='batter'));assert.equal(b.runners.batter,undefined);
 b.battedBall=null;assert.equal(compilePlay(b,{coachBoard:true}).tracks.length,0);
});
