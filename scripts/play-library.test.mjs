import test from 'node:test';
import assert from 'node:assert/strict';
import {copyLibraryPlay,occupancyLabel} from '../src/lib/plays/library.js';
import {newBoard} from '../src/lib/plays/board.js';
test('copies preserve play data and isolate edits while dropping Situation record identity',()=>{
 const source={key:'original',title:'Original',revision:4,displayCode:'S4',variationNumber:2,variationTagVersion:2,active:true,archivedAt:null,boardAnimation:{version:2,movements:{SS:[{path:[{x:1,y:2},{x:3,y:4}],start:{event:'ball_fielded'}}]}},extension:{keep:true},playSeq2:['RF','SS']};
 const copied=copyLibraryPlay('situation',source,' New name ','new-key');assert.equal(copied.key,'new-key');assert.equal(copied.title,'New name');for(const field of ['revision','displayCode','variationNumber','variationTagVersion','active','archivedAt'])assert.equal(copied[field],undefined);assert.deepEqual(copied.boardAnimation,source.boardAnimation);assert.deepEqual(copied.extension,source.extension);copied.boardAnimation.movements.SS[0].path[1].x=100;assert.equal(source.boardAnimation.movements.SS[0].path[1].x,3);
 const board=newBoard();board.sourceSituation=source;const b=copyLibraryPlay('board',board,'Board copy');assert.deepEqual(b.sourceSituation,source);b.defenders.SS.x=1;assert.notEqual(board.defenders.SS.x,1);
 assert.throws(()=>copyLibraryPlay('board',board,'  '),/name/);
});
test('base summaries distinguish every occupancy',()=>{assert.equal(occupancyLabel(0),'Bases empty');assert.equal(occupancyLabel(7),'Bases loaded');assert.equal(new Set(Array.from({length:8},(_,i)=>occupancyLabel(i))).size,8);});
