import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBoard,fromSituation} from '../src/lib/plays/board.js';
import {situationDraft,syncSituationAnimation,situationPlayIssues,writeHandoff,readHandoff,clearHandoff} from '../src/lib/plays/authoring.js';
function fixture(){const b=newBoard();return {key:'same-situation',revision:7,displayCode:'S42',title:'Same play',desc:'Context',category:'Singles',difficulty:'foundational',primaryCategory:'base-coverage',relatedCategories:[],outs:0,runnersOn:{first:false,second:false,third:false},starts:b.defenders,targets:Object.fromEntries(Object.entries(b.defenders).map(([id,p])=>[id,{...p,tol:65,notes:`${id} responsibility`,custom:'kept'}])),hit:{x:1000,y:900},hitType:'grounder',playSeq:['SS','2B','1B'],playSeq2:['RF','2B'],seqNote:'Cutoff note',audience:{staffVariant:'Team variation'},batterAdvance:1,playOutcome:{result:'single',batterResult:'first',outsRecorded:0,reviewStatus:'ready'},runnerOutcomes:[],extension:{keep:true}};}
test('visual edits retain Situation identity, details, tolerance, notes and secondary sequence',()=>{
 const source=fixture(),before=JSON.stringify(source),board=fromSituation(source);
 board.title='Changed';board.movements.SS=[{path:[board.defenders.SS,{x:source.targets.SS.x+100,y:source.targets.SS.y}]}];
 const draft=situationDraft(board);assert.equal(draft.key,source.key);assert.equal(draft.revision,7);assert.equal(draft.displayCode,'S42');assert.equal(draft.targets.SS.x,source.targets.SS.x);assert.equal(draft.boardAnimation.movements.SS[0].path.at(-1).x,source.targets.SS.x+100);assert.equal(draft.targets.SS.notes,source.targets.SS.notes);assert.equal(draft.targets.SS.custom,'kept');assert.deepEqual(draft.extension,source.extension);assert.deepEqual(draft.playSeq2,source.playSeq2);assert.equal(JSON.stringify(source),before);assert.deepEqual(situationPlayIssues(draft),[]);
});
test('structured edits reconcile rich geometry without discarding segments or event conditions',()=>{
 const source=fixture(),board=fromSituation(source),middle={x:1400,y:900};board.movements.SS=[{path:[board.defenders.SS,middle],start:{event:'contact'}},{path:[middle,{x:1300,y:700},source.targets.SS],start:{event:'throw_received',throwIndex:1}}];
 const draft=situationDraft(board);draft.starts.SS.x+=10;draft.targets.SS.y+=40;draft.hit.x+=30;
 const synced=syncSituationAnimation(draft),segments=synced.boardAnimation.movements.SS;
 assert.equal(segments.length,2);assert.deepEqual(segments[0].path[0],draft.starts.SS);assert.equal(segments[1].path.at(-1).y,source.targets.SS.y);assert.equal(synced.targets.SS.y,draft.targets.SS.y);assert.equal(segments[1].path[1].y,700);assert.equal(segments[1].start.event,'throw_received');assert.deepEqual(synced.boardAnimation.battedBall.destination,draft.hit);
});
test('legacy Situation can switch editors without first recording movement and starts retain targets',()=>{
 const source=fixture();assert.equal(syncSituationAnimation(source).boardAnimation,undefined);const board=fromSituation(source);delete board.movements.SS;board.defenders.SS.x+=100;const draft=situationDraft(board);assert.deepEqual(draft.targets.SS,source.targets.SS);assert.deepEqual(situationPlayIssues(draft),[]);
});
test('draft handoff is per user and destination, bounded in age, and cleared explicitly',()=>{
 const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const source=fixture(),draft={...source,title:'Unsaved'};writeHandoff(storage,'coach-a','board',draft,source,'Reason');assert.equal(readHandoff(storage,'coach-a','details'),null);const transfer=readHandoff(storage,'coach-a','board');assert.equal(transfer.situation.key,source.key);assert.equal(transfer.baseline.title,source.title);assert.equal(transfer.rationale,'Reason');clearHandoff(storage);assert.equal(memory.size,0);
 writeHandoff(storage,'coach-a','board',draft);assert.equal(readHandoff(storage,'coach-b','board'),null);assert.equal(memory.size,0);
});
test('shared validation permits recurring throws and reports both geometry and unavailable events',()=>{
 const source=fixture();source.playSeq=['SS','2B','SS'];assert.deepEqual(situationPlayIssues(source),[]);source.targets.SS.x=-1;assert.match(situationPlayIssues(source).map(i=>i.message).join(),/SS/);source.targets.SS.x=1000;const board=fromSituation(source);board.movements.SS=[{path:[board.defenders.SS,{x:1300,y:900}],start:{event:'throw_received',throwIndex:99}}];source.boardAnimation={version:2,movements:board.movements,battedBall:board.battedBall};assert.match(situationPlayIssues(source).map(i=>i.message).join(),/unavailable throw/);
});


test('partial optional movement retains direct fallback for unrecorded defenders and rejects future formats',()=>{
 const source=fixture();source.boardAnimation={version:2,movements:{},battedBall:null};source.starts.SS={x:1300,y:1200};const board=fromSituation(source);assert.deepEqual(board.movements.SS[0].path,[source.starts.SS,{x:source.targets.SS.x,y:source.targets.SS.y}]);source.boardAnimation.version=99;assert.match(situationPlayIssues(source).map(i=>i.message).join(),/Unsupported/);
});

test('coach runner metadata survives synchronization without changing the legacy playback projection',()=>{
 const source=fixture();
 source.runnersOn.first=true;
 const board=fromSituation(source);
 board.running={result:'double',destinations:{first:'home'}};
 board.runners.first={x:2100,y:1240};
 delete board.movements.batter;
 board.movements.first=[{path:[board.runners.first,{x:2040,y:1180}],start:{event:'pre_pitch'}}];

 const draft=situationDraft(board);
 const synced=syncSituationAnimation(draft);
 assert.deepEqual(situationPlayIssues(synced),[]);
 assert.deepEqual(synced.targets,source.targets);
 assert.deepEqual(synced.playSeq,source.playSeq);
 assert.deepEqual(synced.playOutcome,source.playOutcome);
 assert.deepEqual(synced.boardAnimation.running,board.running);
 const reopened=fromSituation(synced,{coachBoard:true});
 assert.deepEqual(reopened.runners.first,board.runners.first);
 assert.deepEqual(reopened.movements.first,board.movements.first);
 assert.equal(reopened.movements.batter,undefined);
 // Authored flags must also survive when no structured runner outcome exists.
 const withTagUp=structuredClone(synced);
 withTagUp.boardAnimation.running.taggedUp={first:true};
 assert.deepEqual(syncSituationAnimation(withTagUp).boardAnimation.running,withTagUp.boardAnimation.running);
 const legacy=fromSituation(synced);
 assert.notDeepEqual(legacy.runners.first,board.runners.first);
 assert.ok(legacy.movements.batter);
 assert.equal(legacy.running.result,'single');

 synced.boardAnimation.runnerStarts.first.x=-1;
 assert.match(situationPlayIssues(synced).map(issue=>issue.message).join(),/Invalid runner starting positions/);
});

test('authored steps round-trip through Situation JSON and schedule movement together before the relay', async()=>{
 const {compilePlay,frameAt}=await import('../src/lib/plays/animation.js');
 const {exportBoardFile,importBoardFile}=await import('../src/lib/plays/board-transfer.js');
 const source=fixture();
 const board=fromSituation(source,{coachBoard:true});
 board.steps=[{id:'step-contact',name:'Hit and cover'},{id:'step-relay',name:'Relay'}];
 board.battedBall.stepId='step-contact';
 board.playSeq=['RF','2B'];
 board.playSeq2=[];
 board.throwSteps=['step-relay'];
 for(const id of ['RF','SS']){
  board.movements[id]=[{path:[board.defenders[id],source.targets[id]],start:{event:'step'},stepId:'step-contact',durationMs:1000}];
 }
 const synced=syncSituationAnimation(situationDraft(board));
 assert.deepEqual(situationPlayIssues(synced),[]);
 assert.deepEqual(synced.targets,source.targets);
 assert.deepEqual(synced.playSeq,['RF','2B']);
 const reopened=fromSituation(synced,{coachBoard:true});
 const play=compilePlay(reopened,{coachBoard:true});
 const tracks=play.tracks.filter(track=>['RF','SS'].includes(track.id));
 assert.equal(tracks[0].start,tracks[1].start);
 assert.ok(play.throws[0].start>=tracks[0].start+tracks[0].duration);
 assert.equal(frameAt(play,play.duration).activeStep,'step-relay');
 assert.equal(Object.keys(frameAt(play,play.duration).positions).filter(id=>id in board.defenders).length,9);
 assert.deepEqual(reopened.steps,board.steps);
 assert.deepEqual(importBoardFile(exportBoardFile(reopened)).throwSteps,board.throwSteps);
 assert.deepEqual(compilePlay(fromSituation(synced)).authoredTimeline.map(step=>step.id),board.steps.map(step=>step.id));
});
