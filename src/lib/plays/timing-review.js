import {readinessReview} from './readiness.js';
import {POSITIONS,clone,hitFielding,fromSituation} from './board.js';
import {situationDraft} from './authoring.js';
import {compilePlay,frameAt,hitBounceDuration,hitFlightDuration} from './animation.js';
import {TIMING_PROFILE,normalSeconds} from './timing.js';
export const REVIEW_BASELINE_VERSION='timing-review-v1';
export const GROUND_CLEARANCE=80; // Provisional native-coordinate chip clearance.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function groundFieldingSuggestion(board){
 const hit=board.battedBall;
 if(!hit||hitFielding(hit)!=='ground')return null;
 const pickup=clone(hit.destination),length=distance(hit.start,pickup);
 const routes=id=>board.movements[id]||[];
 const assigned=hit.fielder;
 const nearby=POSITIONS.filter(id=>routes(id).some(segment=>distance(segment.path.at(-1),pickup)<=100));
 const candidates=assigned?[assigned]:nearby.length?nearby:POSITIONS;
 const fielder=candidates.reduce((best,id)=>distance(board.defenders[id],pickup)<distance(board.defenders[best],pickup)?id:best,candidates[0]);
 const bounce=hit.type==='ground_ball'?null:{durationMs:220,distance:Math.min(220,Math.max(1,length*.2)),height:18};
 const travel=bounce?Math.min(bounce.distance,length*.25):0;
 const landing=length?{x:pickup.x+(hit.start.x-pickup.x)*travel/length,y:pickup.y+(hit.start.y-pickup.y)*travel/length}:clone(pickup);
 const existing=routes(fielder).length>0;
 const durationMs=Math.max(250,hitFlightDuration(hit.type,true)+(bounce?.durationMs||0)+180);
 return {fielder,pickup,landing,bounce,durationMs,existing,assigned:!!assigned,
  route:existing?null:{path:[clone(board.defenders[fielder]),pickup],start:{event:'contact'},durationMs}};
}
export function applyGroundFieldingSuggestion(board,suggestion=groundFieldingSuggestion(board)){
 if(!suggestion)return clone(board);
 const next=clone(board);
 next.battedBall.fielding='ground';next.battedBall.fielder=suggestion.fielder;
 if(suggestion.bounce)next.battedBall.bounce=clone(suggestion.bounce);
 if(suggestion.route)next.movements[suggestion.fielder]=[clone(suggestion.route)];
 return next;
}
export function timingReview(board,{coachBoard=true}={}){
 // Recreate the main app projection, including its generated runner routes.
 if(!coachBoard&&board.sourceSituation)board=fromSituation(situationDraft(board));
 const play=compilePlay(board,{coachBoard,showHitFlight:true});
 const contact=play.contactTime;
 const rows=[];
 const add=(event,time,details='')=>rows.push({event,seconds:Number(normalSeconds(time-contact).toFixed(3)),details});
 if(board.battedBall){
  add('Contact',contact);
  const landing=contact+play.ballDuration;
  add(play.fielding==='ground'?'Landing':'Ball arrival',landing);
  if(play.fielding==='ground')add('Bounce / ground travel ends',landing+hitBounceDuration(board.battedBall));
  add(play.caught?'Catch':'Pickup',play.fieldingTime,play.fielder||'');
 }
 const throws=play.throws.map((leg,index)=>{
  add(`${leg.fromId} → ${leg.toId} release`,leg.start);
  add(`${leg.fromId} → ${leg.toId} reception`,leg.start+leg.duration);
  return {from:leg.fromId,to:leg.toId,distance:Number(distance(leg.from,leg.to).toFixed(1)),
   flightSeconds:Number(normalSeconds(leg.duration).toFixed(3)),
   transferSeconds:Number(normalSeconds(leg.start-(index?play.throws[index-1].start+play.throws[index-1].duration:board.battedBall?play.fieldingTime:0)).toFixed(3)),
   source:board.throwTimings?.some(t=>t.from===leg.fromId&&t.to===leg.toId)?'Authored':board.timingProfile===TIMING_PROFILE?'Distance suggestion':'Existing default'};
 });
 const separation=[];
 if(play.fielding==='ground'&&play.fielder){
  const landing=contact+play.ballDuration,end=landing+hitBounceDuration(board.battedBall);
  for(const [label,time] of [['Landing',landing],['Bounce midpoint',(landing+end)/2],['Ground travel ends',end]]){
   const frame=frameAt(play,time);
   separation.push({label,distance:Number(distance(frame.ball,frame.positions[play.fielder]).toFixed(1))});
  }
  let minimum=Infinity;
  for(let i=0;i<=40;i++){const frame=frameAt(play,landing+(end-landing)*i/40);minimum=Math.min(minimum,distance(frame.ball,frame.positions[play.fielder]));}
  separation.push({label:'Minimum during bounce / ground travel',distance:Number(minimum.toFixed(1))});
 }
 add('Play complete',play.duration);
 return {version:REVIEW_BASELINE_VERSION,view:coachBoard?'Coach Board':'Main app solution',profile:board.timingProfile||'existing-defaults',
  rows,throws,separation,readiness:readinessReview(play),clearance:GROUND_CLEARANCE,warning:play.fieldingWarning,
  note:'Seconds at Normal teaching playback, measured from contact. Separation uses rendered ball coordinates and native field units; review visually before approval.'};
}
export function createTimingBaseline(board,name){
 return {format:'diamond-defence-timing-baseline',version:1,name:name.trim()||board.title,
  board:clone(board),reports:[timingReview(board),timingReview(board,{coachBoard:false})]};
}
export function compareTimingBaseline(baseline,report){
 if(baseline?.format!=='diamond-defence-timing-baseline'||baseline.version!==1||!Array.isArray(baseline.reports))throw new Error('Choose a timing baseline JSON file.');
 const previous=baseline.reports.find(item=>item.view===report.view);
 if(!previous||!Array.isArray(previous.rows)||previous.rows.some(row=>typeof row.event!=='string'||!Number.isFinite(row.seconds)))throw new Error('This baseline has no matching viewpoint.');
 return report.rows.map((row,index)=>{
  const occurrence=report.rows.slice(0,index).filter(candidate=>candidate.event===row.event).length;
  const before=previous.rows.filter(candidate=>candidate.event===row.event)[occurrence];
  return {...row,previous:before?.seconds,delta:before?Number((row.seconds-before.seconds).toFixed(3)):null};
 });
}
