export const MAX_SEGMENTS = 12;
export const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export function throwLegs(board) {
  return [board.playSeq || [],board.playSeq2 || []].flatMap((sequence,stage)=>sequence.slice(1).map((to,i)=>({from:sequence[i],to,stage}))).map((leg,i)=>({...leg,index:i+1}));
}
export function startCondition(segment,index) {
  return segment.start || {event:index ? 'previous_movement' : 'contact'};
}
export function segmentStart(board,id,index) {
  return index ? board.movements[id][index-1].path.at(-1) : board.defenders[id] || board.runners[id];
}
// Keep later curves intact, but explicitly reconnect their initial coordinate.
export function reconcileSegments(board,id) {
  const segments=board.movements[id] || [];
  for(let i=0;i<segments.length;i++) segments[i].path[0]={...segmentStart(board,id,i)};
}
export function eventOptions(board,index=0) {
  return [
    {value:'contact',label:'At contact'},
    ...(index ? [{value:'previous_movement',label:'After previous movement'}] : []),
    {value:'ball_fielded',label:'When ball is fielded'},
    ...throwLegs(board).flatMap(leg=>[
      {value:`throw_started:${leg.index}`,label:`Throw ${leg.index} starts (${leg.from} → ${leg.to})`},
      {value:`throw_received:${leg.index}`,label:`Throw ${leg.index} received (${leg.to})`},
    ]),
  ];
}
export function conditionValue(segment,index){const start=startCondition(segment,index);return start.throwIndex?`${start.event}:${start.throwIndex}`:start.event;}
export function parseCondition(value){const [event,index]=value.split(':');return {...{event},...(index?{throwIndex:Number(index)}:{})};}
