import { throwRoute } from './throws.js';
import { clone, upgradeBoard, validateBoard } from './board.js';
import { startCondition, throwLegs } from './segments.js';

export function measurePath(path) {
  const lengths=path.slice(1).map((p,i)=>Math.hypot(p.x-path[i].x,p.y-path[i].y));
  return {path,lengths,total:lengths.reduce((a,b)=>a+b,0)};
}
export function pointOnPath(path,progress,geometry=measurePath(path)) {
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
const eventKey=start=>start.throwIndex?`${start.event}:${start.throwIndex}`:start.event;
export function compilePlay(input) {
  const board=upgradeBoard(input),issues=validateBoard(board);
  if(issues.length)throw new Error(issues.join('\n'));
  const ballDuration={ground_ball:1400,line_drive:900,fly_ball:2300,pop_fly:3000}[board.battedBall?.type]||0;
  const nodes=new Map(),tracks=[],legs=throwLegs(board);
  nodes.set('contact',{duration:0,deps:[]});
  nodes.set('ball_fielded',{duration:ballDuration,deps:['contact']});
  for(const [id,segments] of Object.entries(board.movements)) for(let i=0;i<segments.length;i++) {
    const segment=segments[i],start=startCondition(segment,i),key=`movement:${id}:${i}`;
    const previous=i?`movement:${id}:${i-1}`:null;
    const deps=[...(previous?[previous]:[]),...(start.event==='previous_movement'?[]:[eventKey(start)])];
    const geometry=measurePath(segment.path);
    const duration=segment.path.every(p=>p.x===segment.path[0].x&&p.y===segment.path[0].y)?0:Math.max(500,Math.min(2400,geometry.total*1.5));
    nodes.set(key,{duration,deps});tracks.push({key,id,index:i,path:segment.path,geometry,duration,condition:start});
  }
  // A throw waits for its participants' movements triggered by earlier events,
  // while movements triggered by that throw can run concurrently with its flight.
  function readyBefore(id,i,throwIndex) {
    const start=startCondition(board.movements[id][i],i);
    if(start.event==='previous_movement')return i>0&&readyBefore(id,i-1,throwIndex);
    return !start.throwIndex || start.throwIndex<throwIndex;
  }
  for(const leg of legs) {
    const deps=[leg.index===1?'ball_fielded':`throw_received:${leg.index-1}`];
    for(const id of new Set([leg.from,leg.to])) (board.movements[id]||[]).forEach((_,i)=>{
      if(readyBefore(id,i,leg.index))deps.push(`movement:${id}:${i}`);
    });
    nodes.set(`throw_started:${leg.index}`,{duration:0,deps});
    nodes.set(`throw_received:${leg.index}`,{duration:700,deps:[`throw_started:${leg.index}`]});
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
  const positionsAt=time=>{
    const positions={...clone(board.defenders),...clone(board.runners)};
    for(const track of tracks)if(time>=track.start)positions[track.id]=pointOnPath(track.path,track.duration?(time-track.start)/track.duration:1,track.geometry);
    return positions;
  };
  const routeCounts=new Map();
  const throws=legs.map(leg=>{
    const start=ends.get(`throw_started:${leg.index}`),end=ends.get(`throw_received:${leg.index}`);
    const from=positionsAt(start)[leg.from],to=positionsAt(end)[leg.to];
    const pair=[leg.from,leg.to].sort().join(':'),count=routeCounts.get(pair)||0;
    routeCounts.set(pair,count+1);
    const length=Math.hypot(to.x-from.x,to.y-from.y)||1;
    const offset=count?{x:-(to.y-from.y)/length*24*count,y:(to.x-from.x)/length*24*count}:{x:0,y:0};
    return {...leg,fromId:leg.from,toId:leg.to,from,to,start,duration:end-start,route:throwRoute(from,to,65,offset)};
  });
  const duration=Math.max(0,...ends.values());
  const rank={contact:0,ball_fielded:1,movement_complete:2,throw_received:3,throw_started:4,play_complete:5};
  const events=[{id:'initial',type:'initial',time:0},...Array.from(nodes.keys()).filter(key=>!key.startsWith('movement:')).map(key=>({id:key,type:key.split(':')[0],throwIndex:Number(key.split(':')[1])||undefined,time:ends.get(key)})),...tracks.map(track=>({id:`${track.key}:complete`,type:'movement_complete',actor:track.id,segmentIndex:track.index,time:track.start+track.duration})),{id:'play_complete',type:'play_complete',time:duration}];
  events.sort((a,b)=>a.time-b.time||(rank[a.type]??-1)-(rank[b.type]??-1));
  return {version:2,board,tracks,throws,ballDuration,duration,events,steps:[...new Set(events.map(event=>event.time))]};
}
export function frameAt(play,time) {
  time=Math.max(0,Math.min(play.duration,time));
  const positions={...clone(play.board.defenders),...clone(play.board.runners)};
  for(const track of play.tracks)if(time>=track.start)positions[track.id]=pointOnPath(track.path,track.duration?(time-track.start)/track.duration:1,track.geometry);
  const hit=play.board.battedBall;
  let ball=hit?pointOnPath([hit.start,hit.destination],play.ballDuration?time/play.ballDuration:1):null;
  const progress=Math.min(1,time/(play.ballDuration||1));
  const lift={ground_ball:0.03,line_drive:0.06,fly_ball:0.25,pop_fly:0.4}[hit?.type]||0;
  const arrows=[];
  for(const leg of play.throws)if(time>leg.start) {
    const p=Math.min(1,(time-leg.start)/leg.duration),eased=1-Math.pow(1-p,3);
    ball=pointOnPath([leg.route.from,leg.route.to],eased);arrows.push({...leg,...leg.route,progress:eased});
  }
  return {time,positions,ball,scale:1+Math.sin(progress*Math.PI)*lift,arrows,events:play.events.filter(event=>event.time<=time)};
}
// Teaching views use a shared quarter-speed clock; authored event times stay unchanged.
export const TEACHING_PLAYBACK_RATE = 0.25;
export function createPlayback(play,onFrame,onState=()=>{},options={}) {
  const rate=Number.isFinite(options.rate)&&options.rate>0?options.rate:1;
  let time=0,running=false,raf=null,previous=0,speed=1;
  const clock=options.now||(()=>performance.now());
  const request=options.requestFrame||(fn=>requestAnimationFrame(fn));
  const cancel=options.cancelFrame||(id=>cancelAnimationFrame(id));
  const render=()=>onFrame(frameAt(play,time));
  function pause(){running=false;if(raf!==null)cancel(raf);raf=null;onState(false);}
  function finish(){pause();options.onComplete?.();}
  function tick(now){if(!running)return;time=Math.min(play.duration,time+Math.max(0,now-previous)*speed*rate);previous=now;render();if(time<play.duration)raf=request(tick);else finish();}
  return {
    play(){if(running)return;if(time>=play.duration)time=0;if(options.reducedMotion){time=play.duration;render();finish();return;}running=true;previous=clock();render();onState(true);raf=request(tick);},
    pause,restart(){pause();time=0;render();},
    seek(value){pause();time=Math.max(0,Math.min(play.duration,value));render();},
    step(direction){const candidates=play.steps.filter(t=>direction>0?t>time:t<time);this.seek(direction>0?(candidates[0]??play.duration):(candidates.at(-1)??0));},
    setSpeed(value){if(Number.isFinite(value)&&value>0)speed=value;},dispose:pause,
  };
}
