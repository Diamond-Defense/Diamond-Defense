import {newBoard,clone,hitFielding} from './board.js';
import {TIMING_PROFILE} from './timing.js';
import {groundFieldingSuggestion,timingReview,GROUND_CLEARANCE} from './timing-review.js';
export const RELAY_CLEARANCE=140;
export function newDesignerBoard(){return {...newBoard(),timingProfile:TIMING_PROFILE};}
// Fill omissions, preserving explicit assignments, timings and routes on existing plays.
export function applyMissingGroundDefaults(board){
 const next=clone(board);
 if(!next.battedBall||hitFielding(next.battedBall)!=='ground')return next;
 const suggestion=groundFieldingSuggestion(next);if(!suggestion)return next;
 next.battedBall.fielding='ground';
 next.battedBall.fielder ||= suggestion.fielder;
 if(suggestion.bounce&&!next.battedBall.bounce)next.battedBall.bounce=suggestion.bounce;
 if(suggestion.route)next.movements[suggestion.fielder]=[suggestion.route];
 return next;
}
export function designerBaselineWarnings(board){
 try{
  const report=timingReview(board),warnings=[];
  if(board.battedBall&&board.timingProfile!==TIMING_PROFILE)warnings.push('This play uses older timing. Review the shared baseline defaults to align hit and movement timing between Coach Board and the main app.');
  for(const leg of report.throws)if(leg.distance<RELAY_CLEARANCE)warnings.push(`${leg.from} and ${leg.to} finish close together (${Math.round(leg.distance)} field units). Review cutoff spacing or consider a deeper pickup while preserving the intended play.`);
  const midpoint=report.separation.find(sample=>sample.label==='Bounce midpoint');
  if(board.battedBall?.type!=='ground_ball'&&midpoint&&midpoint.distance<GROUND_CLEARANCE)warnings.push('The ball overlaps the fielder during the bounce. Preview the ground pickup and adjust the approach or bounce before saving.');
  for(const check of report.readiness||[])if(check.status==='Late')warnings.push(`${check.actor} arrives ${Math.abs(check.marginSeconds).toFixed(2)} s late to ${check.duty.toLowerCase()}. Adjust that route's timing; unrelated backups should not delay the relay.`);
  for(const check of report.readiness||[])if(check.status==='Ahead of runner')warnings.push('C reaches the first-base backup before the runner. Consider a slightly slower trailing route.');
  if(report.warning)warnings.push(report.warning);
  return warnings;
 }catch{return [];}
}
