import {BASES_NATIVE} from './field.js';
import {normalSeconds,NORMAL_SECOND,TIMING_PROFILE} from './timing.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// Conservative, inferred coaching checkpoints, not scoring rules or throw gates.
export function readinessReview(play){
 const contact=play.contactTime,checks=[];
 const routes=id=>play.tracks.filter(track=>track.id===id);
 const endpoint=id=>routes(id).at(-1)?.path.at(-1)||play.board.defenders[id];
 const arrival=id=>Math.max(contact,...routes(id).map(track=>track.start+track.duration));
 const add=(actor,duty,due,earliest=undefined)=>{
  const at=arrival(actor);
  checks.push({actor,duty,arrivalSeconds:Number(normalSeconds(at-contact).toFixed(3)),dueSeconds:Number(normalSeconds(due-contact).toFixed(3)),marginSeconds:Number(normalSeconds(due-at).toFixed(3)),status:at>due?'Late':earliest!==undefined&&at<earliest?'Ahead of runner':'Ready'});
 };
 const batter=routes('batter').at(-1);
 if(batter&&distance(batter.path.at(-1),BASES_NATIVE.first)<=100){
  const due=batter.start+batter.duration;
  if(distance(endpoint('C'),BASES_NATIVE.first)<=350){
   const throwToFirst=play.throws.find(leg=>distance(leg.to,BASES_NATIVE.first)<=200);
   add('C',throwToFirst?'Back up the throw to first':'Trail the runner into first-base backup',throwToFirst?throwToFirst.start+throwToFirst.duration:due+NORMAL_SECOND*.5,throwToFirst?undefined:due);
  }
  if(distance(endpoint('1B'),BASES_NATIVE.first)<=200)add('1B','Be ready at first before the batter arrives',due);
 }
 const outfield=['LF','CF','RF'];
 if(play.fielding==='ground'&&outfield.includes(play.fielder)){
  for(const id of outfield.filter(id=>id!==play.fielder)){
   // Only infer the routine contact-triggered backup. Later authored phases need manual review.
   if(!routes(id).length||routes(id).some(track=>!['contact','pre_pitch','pitch_started'].includes(track.condition.event)))continue;
   if(distance(endpoint(id),play.board.battedBall.destination)<=500)add(id,`Back up ${play.fielder}'s ground pickup`,play.fieldingTime);
   else {
    const target=play.throws.find(leg=>distance(endpoint(id),leg.to)<=500);
    if(target)add(id,`Back up the throw to ${target.toId}`,target.start+target.duration);
   }
  }
 }
 for(const leg of play.throws){
  if(routes(leg.toId).some(track=>!['contact','pre_pitch','pitch_started'].includes(track.condition.event)))continue;
  if(!checks.some(check=>check.actor===leg.toId&&check.dueSeconds===Number(normalSeconds(leg.start+leg.duration-contact).toFixed(3))))add(leg.toId,`Receive ${leg.fromId}'s throw`,leg.start+leg.duration);
 }
 return checks;
}

// Only a brief, non-receiving catcher tail may continue after teaching is ready.
export function solutionTeachingEnd(play){
 if(play.board.timingProfile!==TIMING_PROFILE)return play.duration;
 const catcher=readinessReview(play).find(check=>check.actor==='C'&&check.duty==='Trail the runner into first-base backup'&&check.status==='Ready');
 if(!catcher||play.throws.some(leg=>leg.fromId==='C'||leg.toId==='C'))return play.duration;
 const primary=Math.max(play.contactTime,play.fieldingTime,...play.tracks.filter(track=>track.id!=='C').map(track=>track.start+track.duration),...play.throws.map(leg=>leg.start+leg.duration));
 return play.duration-primary<=NORMAL_SECOND*.6?primary:play.duration;
}
