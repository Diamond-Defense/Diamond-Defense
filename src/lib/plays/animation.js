import {BASES_NATIVE} from './field.js';
import {RUNNERS,hasCustomRunning,runningDestination,automaticRoute,movementPhase} from './running.js';
import { throwRoute } from './throws.js';
import { clone, upgradeBoard, validateBoard, POSITIONS, hitFielding } from './board.js';
import { hitStep, isAuthoredStep, movementStep, playSteps, throwStep } from './steps.js';
import { startCondition, throwLegs } from './segments.js';

export function measurePath(path) {
  const lengths=path.slice(1).map((p,i)=>Math.hypot(p.x-path[i].x,p.y-path[i].y));
  return {path,lengths,total:lengths.reduce((a,b)=>a+b,0)};
}
export function pointOnPath(path,progress,geometry=measurePath(path)) {
  if(progress>=1)return {...path.at(-1)};
  if(progress<=0)return {...path[0]};
  let remaining=Math.max(0,Math.min(1,progress))*geometry.total;
  if(!geometry.total)return {...path.at(-1)};
  for(let i=0;i<geometry.lengths.length;i++) {
    const length=geometry.lengths[i];
    if(remaining<=length){const t=length?remaining/length:0;return {x:path[i].x+(path[i+1].x-path[i].x)*t,y:path[i].y+(path[i+1].y-path[i].y)*t};}
    remaining-=length;
  }
  return {...path.at(-1)};
}
// Clip a route at the same distance-based progress used for its player token.
export function traveledPath(track,time){
  if(time<=track.start||!track.geometry.total)return [];
  const progress=track.duration?Math.min(1,(time-track.start)/track.duration):1;
  if(progress>=1)return track.path;
  let remaining=progress*track.geometry.total;const path=[track.path[0]];
  for(let i=0;i<track.geometry.lengths.length;i++){
    const length=track.geometry.lengths[i];
    if(remaining<=length){path.push(pointOnPath(track.path,progress,track.geometry));break;}
    path.push(track.path[i+1]);remaining-=length;
  }
  return path;
}
export function movementDuration(segment,coachBoard=true){
 if(coachBoard&&segment.durationMs!==undefined)return segment.durationMs;
 const geometry=measurePath(segment.path);
 return geometry.total?Math.max(500,Math.min(2400,geometry.total*1.5)):0;
}
const eventKey=start=>start.throwIndex?`${start.event}:${start.throwIndex}`:start.event;
export function compilePlay(input, options={}) {
  const board=upgradeBoard(input),issues=validateBoard(board);
  if(issues.length)throw new Error(issues.join('\n'));
  if(options.coachBoard)board.runners.batter ||= clone(BASES_NATIVE.home);
  const flightDurations=options.coachBoard
    ? {ground_ball:650,line_drive:450,fly_ball:1000,pop_fly:1400}
    : {ground_ball:1400,line_drive:900,fly_ball:2300,pop_fly:3000};
  const ballDuration=flightDurations[board.battedBall?.type]||0;
  const nodes=new Map(),tracks=[],legs=throwLegs(board);
  const coachBoard=!!options.coachBoard;
  const authoredSteps=coachBoard && board.steps ? playSteps(board) : undefined;
  const order=new Map((authoredSteps || []).map((step,index)=>[step.id,index]));
  const hitOrder=order.get(hitStep(board));
  const movementOrder=(segment,index)=>order.get(movementStep(segment,index,authoredSteps || []));
  const legOrder=index=>order.get(throwStep(board,index,authoredSteps || []));
  const beforeContact=leg=>coachBoard&&legOrder(leg.index)!==undefined&&
    (hitOrder===undefined?!board.battedBall:legOrder(leg.index)<hitOrder);
  const firstHitThrow=legs.find(leg=>!beforeContact(leg));
  const startKey=id=>`step_start:${id}`;
  const endKey=id=>`step_end:${id}`;
  const early=coachBoard?Object.entries(board.movements).flatMap(([id,segments])=>segments.flatMap((segment,i)=>movementPhase(segments,i)==='pre_pitch'?[`movement:${id}:${i}`]:[])):[];
  for(const [index,step] of (authoredSteps || []).entries()){
    nodes.set(startKey(step.id),{duration:0,deps:isAuthoredStep(step.id)&&index?authoredSteps.slice(0,index).map(previous=>endKey(previous.id)):[]});
    nodes.set(endKey(step.id),{duration:0,deps:[startKey(step.id)]});
  }
  if(coachBoard){nodes.set('pre_pitch',{duration:0,deps:[]});nodes.set('pitch_started',{duration:0,deps:[...early,...(board.battedBall?legs.filter(beforeContact).map(leg=>`throw_received:${leg.index}`):[])]});}
  nodes.set('contact',{duration:coachBoard&&board.battedBall?500:0,deps:coachBoard?['pitch_started',...(hitOrder>0&&isAuthoredStep(authoredSteps[hitOrder].id)?[startKey(authoredSteps[hitOrder].id)]:[])]:[]});
  if(coachBoard&&board.battedBall){nodes.set('ball_flight',{duration:ballDuration,deps:['contact']});nodes.set('ball_fielded',{duration:0,deps:['ball_flight']});}
  else nodes.set('ball_fielded',{duration:ballDuration,deps:['contact']});
  if(hitOrder!==undefined)nodes.get(endKey(authoredSteps[hitOrder].id)).deps.push('ball_fielded');
  // The selected baseball event can delay an action within its authored step.
  // Legacy rows keep their original timing when they are shown beside new steps.
  for(const [id,segments] of Object.entries(board.movements)) for(let i=0;i<segments.length;i++) {
    const segment=segments[i],start=startCondition(segment,i),key=`movement:${id}:${i}`;
    const previous=i?`movement:${id}:${i-1}`:null;
    const stepIndex=movementOrder(segment,i),step=authoredSteps?.[stepIndex];
    const trigger=start.event==='step'
      ? (coachBoard&&hitOrder!==undefined&&stepIndex<hitOrder?'pre_pitch':'contact')
      : (!coachBoard&&['pre_pitch','pitch_started'].includes(start.event)?'contact':eventKey(start));
    const deps=[...(previous?[previous]:[]),...(start.event==='previous_movement'?[]:[trigger]),...(step&&isAuthoredStep(step.id)&&!['pre_pitch','pitch_started'].includes(start.event)?[startKey(step.id)]:[])];
    const geometry=measurePath(segment.path);
    const duration=movementDuration(segment,coachBoard);
    if(step)nodes.get(endKey(step.id)).deps.push(key);
    nodes.set(key,{duration,deps});tracks.push({key,id,index:i,path:segment.path,geometry,duration,condition:start});
  }
  let fielder=null,fieldingWarning='';
  if(coachBoard&&board.battedBall){
    const hit=board.battedBall.destination;
    const eligible=tracks.filter(track=>POSITIONS.includes(track.id)&&(['pre_pitch','pitch_started','contact'].includes(movementPhase(board.movements[track.id],track.index)) ||
      track.condition.event==='step' && (hitOrder===undefined || movementOrder(board.movements[track.id][track.index],track.index)<=hitOrder)));
    const nearby=track=>Math.hypot(track.path.at(-1).x-hit.x,track.path.at(-1).y-hit.y)<=100;
    fielder=board.battedBall.fielder||firstHitThrow?.from||(!legs.length?board.playSeq[0]:null)||eligible.find(nearby)?.id||null;
    const candidates=eligible.filter(track=>track.id===fielder);
    const arrival=candidates.find(nearby)||candidates.at(-1);
    if(arrival)nodes.get('ball_fielded').deps.push(arrival.key);
    const position=arrival?.path.at(-1)||board.defenders[fielder];
    if(fielder&&position&&Math.hypot(position.x-hit.x,position.y-hit.y)>100)fieldingWarning=`${fielder}'s route ends away from the ball. Move its endpoint or the ball destination to match.`;
    if(board.battedBall.fielder&&firstHitThrow&&firstHitThrow.from!==fielder)fieldingWarning+=` The throw sequence starts with ${firstHitThrow.from}, rather than ${fielder}.`;
    if(fielder&&!arrival&&(board.movements[fielder]||[]).length)fieldingWarning=`${fielder} needs a movement to the ball before it is fielded.`;
  }
  // A throw waits for its participants' movements triggered by earlier events,
  // while movements triggered by that throw can run concurrently with its flight.
  function readyBefore(id,i,throwIndex) {
    const start=startCondition(board.movements[id][i],i);
    if(start.event==='previous_movement')return i>0&&readyBefore(id,i-1,throwIndex);
    return !start.throwIndex || start.throwIndex<throwIndex;
  }
  for(const leg of legs) {
    const stepIndex=legOrder(leg.index),step=authoredSteps?.[stepIndex];
    const deps=leg.index>1?[`throw_received:${leg.index-1}`]:[];
    if(!beforeContact(leg)&&(!coachBoard||leg.index===firstHitThrow?.index))deps.push('ball_fielded');
    if(step&&isAuthoredStep(step.id))deps.push(startKey(step.id));
    for(const id of new Set([leg.from,leg.to])) (board.movements[id]||[]).forEach((segment,i)=>{
      const actionOrder=movementOrder(segment,i);
      const later=actionOrder!==undefined && stepIndex!==undefined && actionOrder>stepIndex;
      if(!later && readyBefore(id,i,leg.index))deps.push(`movement:${id}:${i}`);
    });
    nodes.set(`throw_started:${leg.index}`,{duration:0,deps});
    nodes.set(`throw_received:${leg.index}`,{duration:coachBoard?350:700,deps:[`throw_started:${leg.index}`]});
    if(step)nodes.get(endKey(step.id)).deps.push(`throw_received:${leg.index}`);
  }
  const resolving=new Set(),ends=new Map(),begins=new Map();
  function resolve(key) {
    if(ends.has(key))return ends.get(key);
    if(resolving.has(key))throw new Error('Movement start events create a circular dependency. Choose an earlier baseball event.');
    const node=nodes.get(key);if(!node)throw new Error(`Unavailable animation event: ${key}.`);
    resolving.add(key);const start=Math.max(0,...node.deps.map(resolve));
    begins.set(key,start);ends.set(key,start+node.duration);resolving.delete(key);return start+node.duration;
  }
  for(const key of nodes.keys())resolve(key);
  for(const track of tracks)track.start=begins.get(track.key);
  const fieldingTime=ends.get('ball_fielded');
  const fielding=coachBoard&&board.battedBall?hitFielding(board.battedBall):null;
  const catchTime=ends.get('contact')+ballDuration;
  const lateCatch=fielding==='caught'&&fieldingTime>catchTime;
  if(lateCatch)fieldingWarning=[fieldingWarning,`${fielder} reaches the spot after the ball lands. Start the route earlier or shorten its duration for a catch.`].filter(Boolean).join(' ');
  const positionsAt=time=>{
    const positions={...clone(board.defenders),...clone(board.runners)};
    for(const track of tracks)if(time>=track.start)positions[track.id]=pointOnPath(track.path,track.duration?(time-track.start)/track.duration:1,track.geometry);
    return positions;
  };
  const caught=fielding==='caught'&&!lateCatch&&!!fielder&&
    Math.hypot(positionsAt(catchTime)[fielder].x-board.battedBall.destination.x,
      positionsAt(catchTime)[fielder].y-board.battedBall.destination.y)<=100;
  // Resolve early movement first, then transition automatic runners at contact.
  // Generated routes are playback-only; never overwrite the coach's authored data.
  if(coachBoard&&board.battedBall){
    const contact=ends.get('contact'),atContact=positionsAt(contact);
    for(const id of RUNNERS.filter(id=>board.runners[id]&&!hasCustomRunning(board,id))){
      for(const track of tracks.filter(track=>track.id===id&&track.start+track.duration>contact)){
        track.path=track.start>=contact?[clone(atContact[id]),clone(atContact[id])]:traveledPath(track,contact);track.geometry=measurePath(track.path);
        if(track.start>=contact)track.start=contact;
        track.duration=Math.max(0,contact-track.start);ends.set(track.key,contact);
      }
      const destination=runningDestination(board,id);
      const path=automaticRoute(id,atContact[id],destination);
      if(path.length<2)continue;
      const geometry=measurePath(path),key=`automatic:${id}`;
      let duration=Math.max(500,geometry.total*1.5);
      if(board.running?.result==='double'&&destination!=='out'){
        const bag=path.at(-1);
        const arrival=legs.filter(leg=>!beforeContact(leg)).map(leg=>{
          const time=ends.get(`throw_received:${leg.index}`);
          const receiver=positionsAt(time)[leg.to];
          return Math.hypot(receiver.x-bag.x,receiver.y-bag.y)<=100?time:Infinity;
        });
        // Leave a visible lead at the bag without changing the authored throw.
        duration=Math.min(duration,Math.min(...arrival)-contact-75);
      }
      tracks.push({key,id,index:(board.movements[id]||[]).length,path,geometry,duration,start:contact,condition:{event:'contact'},automatic:true});
      ends.set(key,contact+duration);
    }
  }
  const routeCounts=new Map();
  const throws=legs.map(leg=>{
    const start=ends.get(`throw_started:${leg.index}`),end=ends.get(`throw_received:${leg.index}`);
    const from=positionsAt(start)[leg.from],to=positionsAt(end)[leg.to];
    const pair=[leg.from,leg.to].sort().join(':'),count=routeCounts.get(pair)||0;
    routeCounts.set(pair,count+1);
    const length=Math.hypot(to.x-from.x,to.y-from.y)||1;
    const offset=count?{x:-(to.y-from.y)/length*24*count,y:(to.x-from.x)/length*24*count}:{x:0,y:0};
    return {...leg,beforeContact:beforeContact(leg),fromId:leg.from,toId:leg.to,from,to,start,duration:end-start,route:throwRoute(from,to,65,offset)};
  });
  const duration=Math.max(0,...ends.values());
  const rank={contact:0,ball_fielded:1,movement_complete:2,throw_received:3,throw_started:4,play_complete:5};
  const events=[{id:'initial',type:'initial',time:0},...Array.from(nodes.keys()).filter(key=>!key.startsWith('movement:')&&key!=='ball_flight'&&!key.startsWith('step_')).map(key=>({id:key,type:key.split(':')[0],throwIndex:Number(key.split(':')[1])||undefined,time:ends.get(key)})),...tracks.map(track=>({id:`${track.key}:complete`,type:'movement_complete',actor:track.id,segmentIndex:track.index,time:track.start+track.duration})),{id:'play_complete',type:'play_complete',time:duration}];
  events.sort((a,b)=>a.time-b.time||(rank[a.type]??-1)-(rank[b.type]??-1));
  const contactTime=ends.get('contact'),pitchStart=coachBoard?ends.get('pitch_started'):0;
  const pitchFrom=coachBoard?positionsAt(pitchStart).P:null;
  const authoredTimeline=authoredSteps?.map(step=>({
    ...step,start:begins.get(startKey(step.id)),end:ends.get(endKey(step.id))
  }));
  return {version:2,authoredTimeline,board,tracks,throws,ballDuration,fieldingTime,fielding,lateCatch,caught,fielder,fieldingWarning,contactTime,pitchStart,pitchFrom,coachBoard,duration,events,steps:authoredTimeline?.length?[...new Set([0,...authoredTimeline.map(step=>step.end).sort((a,b)=>a-b),duration])]:[...new Set(events.map(event=>event.time))]};
}
// Project height on screen while keeping field coordinates and gameplay targets intact.
function hitPoint(hit, progress, caught) {
  const grounder=hit.type==='ground_ball';
  const ground=pointOnPath([hit.start,hit.destination],grounder?1-(1-progress)**1.35:progress);
  const arc={ground_ball:0,line_drive:36,fly_ball:145,pop_fly:245}[hit.type];
  const height=grounder
    ? Math.abs(Math.sin(Math.PI*3*progress))*24*(1-progress)
    : (progress===1?0:Math.sin(Math.PI*progress)**(hit.type==='pop_fly'?0.75:1)*arc);
  const gloveLift=caught?18*progress:0;
  return {ground,ball:{x:ground.x,y:ground.y-height-gloveLift},height:height+gloveLift};
}
export function frameAt(play,time) {
  time=Math.max(0,Math.min(play.duration,time));
  const positions={...clone(play.board.defenders),...clone(play.board.runners)};
  for(const track of play.tracks)if(time>=track.start)positions[track.id]=pointOnPath(track.path,track.duration?(time-track.start)/track.duration:1,track.geometry);
  const hit=play.board.battedBall;
  const hitTime=Math.max(0,time-(play.contactTime||0));
  let ball=hit?pointOnPath([hit.start,hit.destination],play.ballDuration?hitTime/play.ballDuration:1):null;
  if(play.coachBoard&&hit&&time<play.contactTime){ball=time<play.pitchStart?null:pointOnPath([play.pitchFrom,hit.start],(time-play.pitchStart)/(play.contactTime-play.pitchStart));}
  const progress=Math.min(1,hitTime/(play.ballDuration||1));
  const lift={ground_ball:0.03,line_drive:0.06,fly_ball:0.25,pop_fly:0.4}[hit?.type]||0;
  let hitTrail=[], ballShadow=null;
  const inFlight=play.coachBoard&&hit&&time>=play.contactTime&&progress<1;
  const caught=play.caught;
  // A missed catch settles at the same destination and uses the pickup timing.

  if(inFlight){
    const position=hitPoint(hit,progress,caught);
    ball=position.ball;
    if(position.height>5&&['fly_ball','pop_fly'].includes(hit.type))ballShadow=position.ground;
    const tail=Math.max(0,progress-({ground_ball:.3,line_drive:.24,fly_ball:.32,pop_fly:.38}[hit.type]));
    hitTrail=Array.from({length:9},(_,i)=>hitPoint(hit,tail+(progress-tail)*i/8,caught).ball);
  }else if(caught&&ball&&time>=play.fieldingTime){
    ball={x:hit.destination.x,y:hit.destination.y-18};
  }
  const fieldingLabel=play.fielding&&time>=play.fieldingTime&&time<=play.fieldingTime+400
    ? `${caught?'Caught':'Fielded'}${play.fielder?` by ${play.fielder}`:''}`
    : '';
  const arrows=[];
  for(const leg of play.throws)if(time>leg.start) {
    const p=Math.min(1,(time-leg.start)/leg.duration),eased=play.coachBoard?p:1-Math.pow(1-p,3);
    if(!leg.beforeContact||!hit||time<play.pitchStart)ball=pointOnPath([leg.route.from,leg.route.to],eased);
    arrows.push({...leg,...leg.route,progress:eased});
  }
  const activeStep=play.authoredTimeline?.find(step=>time>=step.start&&time<step.end)?.id || play.authoredTimeline?.findLast(step=>time>=step.start)?.id;
  return {time,activeStep,positions,ball,ballShadow,hitTrail,fieldingLabel,scale:1+Math.sin(progress*Math.PI)*lift,arrows,events:play.events.filter(event=>event.time<=time)};
}
// Teaching views use a shared quarter-speed clock; authored event times stay unchanged.
export const TEACHING_PLAYBACK_RATE = 0.25;
export function createPlayback(play,onFrame,onState=()=>{},options={}) {
  const rate=Number.isFinite(options.rate)&&options.rate>0?options.rate:1;
  const start=options.startTime??0;
  const end=options.endTime??play.duration;
  let time=start,running=false,raf=null,previous=0,speed=1;
  const clock=options.now||(()=>performance.now());
  const request=options.requestFrame||(fn=>requestAnimationFrame(fn));
  const cancel=options.cancelFrame||(id=>cancelAnimationFrame(id));
  const render=()=>onFrame(frameAt(play,time));
  function pause(){running=false;if(raf!==null)cancel(raf);raf=null;onState(false);}
  function finish(){pause();options.onComplete?.();}
  function tick(now){if(!running)return;time=Math.min(end,time+Math.max(0,now-previous)*speed*rate);previous=now;render();if(time<end)raf=request(tick);else finish();}
  return {
    play(){if(running)return;if(time>=end)time=start;if(options.reducedMotion){time=end;render();finish();return;}running=true;previous=clock();render();onState(true);raf=request(tick);},
    pause,restart(){pause();time=start;render();},
    seek(value){pause();time=Math.max(start,Math.min(end,value));render();},
    step(direction){const candidates=play.steps.filter(t=>direction>0?t>time:t<time);this.seek(direction>0?(candidates[0]??end):(candidates.at(-1)??start));},
    setSpeed(value){if(Number.isFinite(value)&&value>0)speed=value;},dispose:pause,
  };
}
