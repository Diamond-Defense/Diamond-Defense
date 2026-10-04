import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newBoard,clone} from '../src/lib/plays/board.js';
import {compilePlay,frameAt} from '../src/lib/plays/animation.js';
import {BOARD_FILE_FORMAT,exportBoardFile,importBoardFile,boardFileName} from '../src/lib/plays/board-transfer.js';
test('portable round trip retains play settings and drops record identity and source Situation',()=>{
 const b=newBoard();b.title='My board';b.id='private-record';b.ownerId='coach-private';b.revision=9;b.sourceSituation={key:'shared-key',createdBy:'private-user'};
 b.movements.P=[{path:[b.defenders.P,{x:1590,y:1260}],start:{event:'pre_pitch'},durationMs:650}];
 b.running={result:'double',destinations:{batter:'third'}};const snapshot=JSON.stringify(b);
 const text=exportBoardFile(b),imported=importBoardFile(text);
 assert.equal(JSON.stringify(b),snapshot);assert.deepEqual(imported.movements,b.movements);assert.deepEqual(imported.running,b.running);
 assert.equal(imported.sourceSituation,null);assert.equal(imported.id,undefined);assert.equal(imported.ownerId,undefined);assert.equal(imported.revision,undefined);assert.ok(!text.includes('private-user'));
 assert.equal(JSON.parse(text).format,BOARD_FILE_FORMAT);assert.equal(boardFileName('Wheel / Play!'),'wheel-play.board.json');
});
test('import rejects malformed, unsupported, oversized and invalid-route files',()=>{
 assert.throws(()=>importBoardFile('{'),/valid Board JSON/);assert.throws(()=>importBoardFile(' '.repeat(1000001)),/1 MB/);
 assert.throws(()=>importBoardFile(JSON.stringify({format:BOARD_FILE_FORMAT,version:99,board:newBoard()})),/Unsupported/);
 const b=newBoard();b.movements.P=[{path:[b.defenders.P,{x:-1,y:100}],start:{event:'contact'}}];
 assert.throws(()=>exportBoardFile(b),/Invalid path/);
 b.movements.P=[null];assert.throws(()=>importBoardFile(JSON.stringify({format:BOARD_FILE_FORMAT,version:1,board:b})),/Invalid path/);
 b.movements.P=[{path:[b.defenders.P,{x:1600,y:1300}],durationMs:0}];assert.throws(()=>exportBoardFile(b),/duration/);
});
test('import rejects early movement dependency cycles and preserves the current input',()=>{
 const b=newBoard();b.movements.P=[{path:[b.defenders.P,{x:1590,y:1240}],start:{event:'contact'}},{path:[{x:1590,y:1240},{x:1600,y:1250}],start:{event:'pre_pitch'}}];
 assert.throws(()=>importBoardFile(JSON.stringify({format:BOARD_FILE_FORMAT,version:1,board:b})),/circular dependency/);
});
test('wheel file gives the late rotation, tag timing and one-out fielder choice',()=>{
 const board=importBoardFile(readFileSync(new URL('../docs/examples/wheel-play.board.json',import.meta.url),'utf8')),snapshot=clone(board),play=compilePlay(board,{coachBoard:true});
 assert.equal(board.outs,0);assert.deepEqual(Object.keys(board.runners).sort(),['batter','second']);assert.deepEqual(board.playSeq,['3B','SS']);
 const ss=play.tracks.find(t=>t.id==='SS'&&t.index===1),charge=play.tracks.find(t=>t.id==='1B'&&t.index===0),rotation=play.tracks.find(t=>t.id==='1B'&&t.index===1),runner=play.tracks.find(t=>t.id==='second'&&t.index===1);
 assert.equal(ss.start,play.contactTime);assert.ok(charge.start<play.contactTime);assert.equal(rotation.start,play.contactTime);assert.ok(ss.start+ss.duration<=play.throws[0].start);
 assert.ok(runner.start+runner.duration>play.throws[0].start+play.throws[0].duration);
 assert.deepEqual(frameAt(play,play.duration).positions.batter,{x:2170,y:1304});assert.deepEqual(frameAt(play,play.duration).positions['1B'],{x:1572,y:854});
 assert.notEqual(compilePlay(board).tracks.find(t=>t.id==='P'&&t.index===0).duration,550);
 assert.equal(board.situationMetadata.playOutcome.outsRecorded,1);assert.equal(board.situationMetadata.runnerOutcomes[0].outType,'tag');assert.deepEqual(board,snapshot);
});
