import {clone,upgradeBoard,validateBoard} from './board.js';
import {compilePlay} from './animation.js';
export const BOARD_FILE_FORMAT='diamond-defence-coach-board';
export const MAX_BOARD_FILE_BYTES=1000000;
const fields=['version','title','outs','offenseNumbers','defenders','runners','running','movements','battedBall','playSeq','playSeq2','animation','situationMetadata'];
function portableBoard(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('The file does not contain a Board.');
 const board=Object.fromEntries(fields.filter(key=>Object.hasOwn(value,key)).map(key=>[key,clone(value[key])]));
 board.sourceSituation=null;
 const issues=validateBoard(board);if(issues.length)throw new Error(issues.join('\n'));
 const upgraded=upgradeBoard(board);compilePlay(upgraded,{coachBoard:true});return upgraded;
}
export function exportBoardFile(board){
 const payload={format:BOARD_FILE_FORMAT,version:1,board:portableBoard(board)};
 const text=JSON.stringify(payload,null,2)+'\n';
 if(new TextEncoder().encode(text).length>MAX_BOARD_FILE_BYTES)throw new Error('Board file must be smaller than 1 MB.');
 return text;
}
export function importBoardFile(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BOARD_FILE_BYTES)throw new Error('Board file must be smaller than 1 MB.');
 let value;try{value=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('Choose a valid Board JSON file.');}
 if(value?.format!==BOARD_FILE_FORMAT||value?.version!==1)throw new Error('Unsupported Board file format or version.');
 try{return portableBoard(value.board);}catch(error){if(error instanceof TypeError)throw new Error('The Board contains malformed movement or position data.');throw error;}
}
export function boardFileName(title){return `${title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'coach-board'}.board.json`;}
