import {solutionTeachingEnd} from '../src/lib/plays/readiness.js';
import {positioningSolutionBoard} from '../src/lib/plays/authoring.js';
import {newDesignerBoard,applyMissingGroundDefaults,designerBaselineWarnings,RELAY_CLEARANCE} from '../src/lib/plays/designer-defaults.js';
import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {newBoard,fromSituation,boardAnimation} from '../src/lib/plays/board.js';
import {compilePlay,frameAt} from '../src/lib/plays/animation.js';
import {TIMING_PROFILE,THROW_DISTANCE_TABLE,suggestedThrowDuration} from '../src/lib/plays/timing.js';
import {groundFieldingSuggestion,applyGroundFieldingSuggestion,timingReview,createTimingBaseline,compareTimingBaseline} from '../src/lib/plays/timing-review.js';
import {exportBoardFile,importBoardFile} from '../src/lib/plays/board-transfer.js';
import {syncSituationAnimation} from '../src/lib/plays/authoring.js';
const s01=()=>JSON.parse(readFileSync(new URL('../situations.json',import.meta.url),'utf8')).find(item=>item.key==='BD-01');

test('provisional throw timing interpolates continuously and leaves existing defaults intact',()=>{
 let previous=0;
 for(let distance=0;distance<=3000;distance+=10){const duration=suggestedThrowDuration(distance);expect(duration).toBeGreaterThanOrEqual(previous);previous=duration;}
 for(const row of THROW_DISTANCE_TABLE.slice(1))expect(Math.abs(suggestedThrowDuration(row.distance-.01)-suggestedThrowDuration(row.distance+.01))).toBeLessThanOrEqual(1);
 const board=newBoard();board.playSeq=['SS','2B'];
 expect(compilePlay(board,{coachBoard:true}).throws[0].duration).toBe(350);
 expect(compilePlay(board).throws[0].duration).toBe(700);
});

test('distance timing uses the receiver position at reception and preserves authored overrides',()=>{
 const board=newBoard();board.timingProfile=TIMING_PROFILE;board.playSeq=['SS','2B'];
 board.movements['2B']=[{path:[board.defenders['2B'],{x:2100,y:1100}],durationMs:500,start:{event:'throw_started',throwIndex:1}}];
 const play=compilePlay(board,{coachBoard:true}),leg=play.throws[0];
 const target=frameAt(play,leg.start+leg.duration).positions['2B'];
 expect(target).toEqual(leg.to);
 expect(Math.abs(leg.duration-suggestedThrowDuration(Math.hypot(leg.from.x-target.x,leg.from.y-target.y)))).toBeLessThanOrEqual(2);
 board.throwTimings=[{from:'SS',to:'2B',durationMs:180,transferMs:70}];
 const overridden=compilePlay(board,{coachBoard:true});
 expect(overridden.throws[0].duration).toBe(180);
 expect(overridden.throws[0].start).toBe(70);
});

test('ground pickup suggestions prefer assigned fielders and preserve authored routes',()=>{
 const board=fromSituation(s01(),{coachBoard:true}),before=structuredClone(board);
 const suggestion=groundFieldingSuggestion(board);
 expect(suggestion.fielder).toBe('LF');expect(suggestion.existing).toBe(true);
 const next=applyGroundFieldingSuggestion(board,suggestion);
 expect(board).toEqual(before);expect(next.movements).toEqual(board.movements);expect(next.playSeq).toEqual(board.playSeq);
 expect(next.battedBall.destination).toEqual(board.battedBall.destination);
 const towardHome={x:board.battedBall.start.x-board.battedBall.destination.x,y:board.battedBall.start.y-board.battedBall.destination.y};
 expect((suggestion.landing.x-suggestion.pickup.x)*towardHome.x+(suggestion.landing.y-suggestion.pickup.y)*towardHome.y).toBeGreaterThan(0);
 next.battedBall.fielding='caught';expect(groundFieldingSuggestion(next)).toBeNull();
});

test('a new suggested approach completes after visible ground travel and profiles survive round trips',()=>{
 const board=newBoard();board.battedBall={type:'line_drive',start:{x:1577,y:1734},destination:{x:900,y:850},fielding:'ground'};
 const suggested=applyGroundFieldingSuggestion(board);suggested.timingProfile=TIMING_PROFILE;
 expect(suggested.battedBall.fielder).toBe('LF');
 const report=timingReview(suggested);
 expect(report.rows.find(row=>row.event==='Pickup').seconds).toBeGreaterThan(report.rows.find(row=>row.event==='Bounce / ground travel ends').seconds);
 expect(importBoardFile(exportBoardFile(suggested)).timingProfile).toBe(TIMING_PROFILE);
 const situation=s01();situation.boardAnimation=boardAnimation(suggested);
 expect(syncSituationAnimation(situation).boardAnimation.timingProfile).toBe(TIMING_PROFILE);
});

test('named baselines remain immutable and show event changes in normal playback seconds',()=>{
 const board=fromSituation(s01(),{coachBoard:true}),baseline=createTimingBaseline(board,'S01 reference');
 const saved=JSON.stringify(baseline);
 board.throwTimings[0].durationMs+=50;
 const comparison=compareTimingBaseline(baseline,timingReview(board));
 expect(comparison.find(row=>row.event==='LF → SS reception').delta).toBe(.2);
 expect(JSON.stringify(baseline)).toBe(saved);
 expect(()=>compareTimingBaseline({format:'other'},timingReview(board))).toThrow();
});


test('S02 keeps a single while separating the relay and aligning both viewpoints',()=>{
 const situation=JSON.parse(readFileSync(new URL('../situations.json',import.meta.url),'utf8')).find(item=>item.key==='BD-02');
 const baseline=createTimingBaseline(fromSituation(situation,{coachBoard:true}),'S02');
 expect(situation.playOutcome.result).toBe('single');
 expect(situation.playOutcome.batterResult).toBe('first');
 expect(situation.playSeq).toEqual(['CF','2B','SS']);
 expect(baseline.reports[0].rows).toEqual(baseline.reports[1].rows);
 for(const report of baseline.reports){
  expect(report.throws.every(leg=>leg.distance>=RELAY_CLEARANCE)).toBe(true);
  expect(report.throws.every(leg=>leg.flightSeconds<1.4&&leg.transferSeconds>0)).toBe(true);
  expect(report.rows.find(row=>row.event==='Pickup').seconds).toBeGreaterThan(report.rows.find(row=>row.event==='Bounce / ground travel ends').seconds);
 }
});

test('new designer ground balls receive defaults without replacing authored choices',()=>{
 const board=newDesignerBoard();
 expect(board.timingProfile).toBe(TIMING_PROFILE);
 board.battedBall={type:'line_drive',start:{x:1577,y:1734},destination:{x:900,y:850}};
 const prepared=applyMissingGroundDefaults(board);
 expect(board.battedBall.fielder).toBeUndefined();
 expect(prepared.battedBall.fielding).toBe('ground');
 expect(prepared.battedBall.fielder).toBe('LF');
 expect(prepared.movements.LF).toHaveLength(1);
 prepared.battedBall.bounce={durationMs:300,distance:100,height:12};
 prepared.movements.LF[0].durationMs=1200;
 prepared.throwTimings=[{from:'LF',to:'SS',durationMs:180,transferMs:90}];
 expect(applyMissingGroundDefaults(prepared)).toEqual(prepared);
 const caught=structuredClone(board);caught.battedBall.fielding='caught';
 expect(applyMissingGroundDefaults(caught)).toEqual(caught);
});

test('designer flags crowded relay geometry without changing the play',()=>{
 const board=newDesignerBoard();board.playSeq=['SS','2B'];
 board.defenders['2B']={x:board.defenders.SS.x+40,y:board.defenders.SS.y};
 const before=structuredClone(board);
 expect(designerBaselineWarnings(board).some(warning=>warning.includes('finish close together'))).toBe(true);
 expect(board).toEqual(before);
});


test('routine singles establish backups before their duty without gating the relay',()=>{
 const situations=JSON.parse(readFileSync(new URL('../situations.json',import.meta.url),'utf8')).filter(item=>['BD-01','BD-02'].includes(item.key));
 for(const situation of situations){
  const board=fromSituation(situation,{coachBoard:true});
  const baseline=createTimingBaseline(board,'Readiness');
  for(const report of baseline.reports){
   expect(report.readiness.find(check=>check.actor==='C').status).toBe('Ready');
   expect(report.readiness.find(check=>check.actor==='1B').status).toBe('Ready');
   expect(report.readiness.every(check=>check.status==='Ready')).toBe(true);
  }
  const original=compilePlay(board,{coachBoard:true});
  const slow=structuredClone(board);slow.movements.C[0].durationMs=1800;
  const delayed=compilePlay(slow,{coachBoard:true});
  expect(delayed.throws.map(leg=>[leg.start,leg.duration])).toEqual(original.throws.map(leg=>[leg.start,leg.duration]));
  expect(timingReview(slow).readiness.find(check=>check.actor==='C').status).toBe('Late');
  expect(designerBaselineWarnings(slow).some(warning=>warning.startsWith('C arrives'))).toBe(true);
 }
});


test('routine-single catcher trails the runner without holding Watch Solution completion',()=>{
 const situations=JSON.parse(readFileSync(new URL('../situations.json',import.meta.url),'utf8')).filter(item=>['BD-01','BD-02'].includes(item.key));
 for(const situation of situations){
  const board=positioningSolutionBoard(fromSituation(situation));
  const play=compilePlay(board,{showHitFlight:true});
  const batter=play.tracks.find(track=>track.id==='batter'),catcher=play.tracks.find(track=>track.id==='C');
  expect(catcher.start+catcher.duration).toBeGreaterThan(batter.start+batter.duration);
  const ready=solutionTeachingEnd(play);
  expect(ready).toBeLessThan(play.duration);
  expect(ready).toBeGreaterThanOrEqual(batter.start+batter.duration);
  expect(frameAt(play,ready).positions.C).not.toEqual(frameAt(play,play.duration).positions.C);
  const slow=structuredClone(board);slow.movements.C[0].durationMs=1800;
  const delayed=compilePlay(slow,{showHitFlight:true});
  expect(solutionTeachingEnd(delayed)).toBe(delayed.duration);
 }
});


test('reviewed S03/S04 share event timing and ready backups in both views',()=>{
 const situations=JSON.parse(readFileSync(new URL('../situations.json',import.meta.url),'utf8'));
 for(const key of ['BD-03','BD-04']){
  const board=fromSituation(situations.find(s=>s.key===key));
  const coach=timingReview(board),player=timingReview(board,{coachBoard:false});
  expect(player.rows).toEqual(coach.rows);
  expect(coach.readiness.every(check=>check.status==='Ready')).toBe(true);
  expect(coach.separation.find(row=>row.label==='Bounce midpoint').distance).toBeGreaterThanOrEqual(80);
  expect(coach.rows.find(row=>row.event==='Pickup').seconds).toBeGreaterThan(coach.rows.find(row=>row.event==='Bounce / ground travel ends').seconds);
  expect(coach.throws.every(leg=>leg.transferSeconds>0)).toBe(true);
 }
});
