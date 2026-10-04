// Presentation labels describe shared engine snapshots; no separate timing model.
export function describeEvent(event) {
  switch(event.type){
    case 'initial':return 'Starting alignment';
    case 'contact':return 'Contact';
    case 'ball_fielded':return 'Ball fielded';
    case 'movement_complete':return `${event.actor} movement ${event.segmentIndex+1} complete`;
    case 'throw_started':return `Throw ${event.throwIndex} started`;
    case 'throw_received':return `Throw ${event.throwIndex} received`;
    case 'play_complete':return 'Final state';
    default:return event.type.replaceAll('_',' ');
  }
}
export function presentationStatus(play,frame) {
  if(!frame||frame.time===0)return 'Starting alignment';
  const occurred=frame.events||[],time=occurred.at(-1)?.time;
  const events=occurred.filter(event=>event.time===time);
  // Concurrent events deliberately share a snapshot, rather than creating
  // artificial pauses between things happening at the same instant.
  return [...new Set(events.map(describeEvent))].join(' · ')||'Starting alignment';
}
