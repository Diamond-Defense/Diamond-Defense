// Provisional teaching-playback defaults, not measured baseball flight times.
export const TEACHING_PLAYBACK_RATE=0.25;
export const TIMING_PROFILE='distance-v1';
export const NORMAL_SECOND=1000*TEACHING_PLAYBACK_RATE;
export const THROW_DISTANCE_TABLE=Object.freeze([
 {distance:0,seconds:.3,label:'Very short'},
 {distance:200,seconds:.5,label:'Short toss'},
 {distance:500,seconds:.8,label:'Short'},
 {distance:1000,seconds:1.2,label:'Medium'},
 {distance:1600,seconds:1.7,label:'Long'},
 {distance:2400,seconds:2.2,label:'Very long'},
]);
export function suggestedThrowDuration(distance){
 const d=Math.max(0,Number.isFinite(distance)?distance:0);
 for(let i=1;i<THROW_DISTANCE_TABLE.length;i++){
  const a=THROW_DISTANCE_TABLE[i-1],b=THROW_DISTANCE_TABLE[i];
  if(d<=b.distance)return Math.round((a.seconds+(b.seconds-a.seconds)*(d-a.distance)/(b.distance-a.distance))*NORMAL_SECOND);
 }
 return Math.round(THROW_DISTANCE_TABLE.at(-1).seconds*NORMAL_SECOND);
}
export function suggestedTransferDuration(firstGroundPickup=false){
 return Math.round((firstGroundPickup?.36:.28)*NORMAL_SECOND);
}
export const normalSeconds=time=>time/NORMAL_SECOND;
