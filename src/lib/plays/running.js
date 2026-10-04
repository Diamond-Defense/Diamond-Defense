import {BASES_NATIVE} from './field.js';
import {startCondition} from './segments.js';
export const RUN_RESULTS=['single','double','triple','home_run','out'];
export const RUNNERS=['batter','first','second','third'];
const bases=['home','first','second','third','home'];
export function movementPhase(segments,index){
 const event=startCondition(segments[index],index).event;
 return event==='previous_movement'&&index?movementPhase(segments,index-1):event;
}
export function hasCustomRunning(board,id){return (board.movements[id]||[]).some((_,i)=>!['pre_pitch','pitch_started'].includes(movementPhase(board.movements[id],i)));}
export function runningDestination(board,id){
 if(board.running?.destinations?.[id])return board.running.destinations[id];
 const result=board.running?.result||'single';
 if(result==='out')return id==='batter'?'out':'hold';
 const advance={single:1,double:2,triple:3,home_run:4}[result]||1;
 return bases[Math.min(4,(id==='batter'?0:bases.indexOf(id))+advance)];
}
export function automaticRoute(id,start,destination){
 if(destination==='hold')return [];
 const index=id==='batter'?0:bases.indexOf(id);
 if(destination==='out'){
  const next=BASES_NATIVE[bases[index+1]];
  return [start,{x:start.x+(next.x-start.x)*.8,y:start.y+(next.y-start.y)*.8}];
 }
 const end=destination==='home'?4:bases.indexOf(destination);
 return end>index?[start,...bases.slice(index+1,end+1).map(base=>({...BASES_NATIVE[base]}))]:[];
}
export function useAutomaticRunning(board,id){
 const segments=board.movements[id]||[],firstCustom=segments.findIndex((_,i)=>!['pre_pitch','pitch_started'].includes(movementPhase(segments,i)));
 if(firstCustom>=0){const early=segments.slice(0,firstCustom);if(early.length)board.movements[id]=early;else delete board.movements[id];}
}
