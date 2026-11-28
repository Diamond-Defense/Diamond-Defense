import { boardAnimation, clone, fromSituation, POSITIONS, validateBoard } from './board.js';
import { compilePlay } from './animation.js';
import { startCondition, throwLegs } from './segments.js';
import { playSteps, hitStep, movementStep, throwStep } from './steps.js';

// Pack generated throw-only steps into one relay when opening a training situation.
export function consolidateSituationRelay(board) {
  const legs=throwLegs(board);
  if(legs.length<2||board.playSeq2?.length||board.throwSteps?.some(Boolean))return board;
  const steps=playSteps(board);
  const contact=steps.findIndex(step=>step.id===hitStep(board,steps));
  const first=steps.findIndex(step=>step.id==='throw_started:1');
  if(contact<0||first<=contact)return board;

  const relaySteps=steps.slice(first,first+legs.length);
  if(!legs.every((leg,index)=>relaySteps[index]?.id===`throw_started:${leg.index}`&&
    relaySteps[index].name===`${leg.from} → ${leg.to}`))return board;
  const relayIds=new Set(relaySteps.map(step=>step.id));
  if(Object.values(board.movements).some(segments=>segments.some((segment,index)=>
    relayIds.has(movementStep(segment,index,steps)))))return board;

  // Reuse a generated event ID so the relay does not add an authored timing barrier.
  const id=relaySteps[0].id;
  return {...board,steps:[...steps.slice(0,first),{id,name:'Relay'},...steps.slice(first+legs.length)],
    throwSteps:legs.map(()=>id)};
}

export function positioningSolutionBoard(board) {
  const steps=playSteps(board);
  const hitOrder=steps.findIndex(step=>step.id===hitStep(board,steps));
  const relayOrder=steps.findIndex(step=>step.id===throwStep(board,1,steps));
  const movements={};
  for(const [id,segments] of Object.entries(board.movements)){
    const firstRelayMovement=segments.findIndex((segment,index)=>{
      const event=startCondition(segment,index).event;
      if(event==='throw_started'||event==='throw_received')return true;
      const order=steps.findIndex(step=>step.id===movementStep(segment,index,steps));
      return relayOrder>hitOrder&&order>=relayOrder;
    });
    const retained=firstRelayMovement<0?segments:segments.slice(0,firstRelayMovement);
    if(retained.length)movements[id]=retained;
  }
  return {...board,movements,playSeq:[],playSeq2:[],throwSteps:undefined};
}

// Situation owns identity, correctness, outcomes and details. Board is its spatial projection.
export function situationDraft(board, source = board.sourceSituation) {
  if (!source?.key) throw new Error('Open a Situation before saving Situation changes.');
  const draft=clone(source);
  draft.title=board.title;draft.outs=Number(board.outs);draft.starts=clone(board.defenders);
  draft.runnersOn=Object.fromEntries(['first','second','third'].map(base=>[base,!!board.runners[base]]));
  draft.targets=Object.fromEntries(POSITIONS.map(id=>{
    const end=source.targets?.[id] || board.defenders[id];
    return [id,{...clone(source.targets?.[id]||{}),x:end.x,y:end.y}];
  }));
  draft.playSeq=clone(board.playSeq);draft.playSeq2=clone(board.playSeq2);
  if(board.battedBall){draft.hit=clone(board.battedBall.destination);draft.hitType={ground_ball:'grounder',line_drive:'line',fly_ball:'popup',pop_fly:'popup'}[board.battedBall.type];}
  draft.boardAnimation=boardAnimation(board);
  const original=fromSituation(source,{coachBoard:true});
  if(!source.boardAnimation?.runnerStarts&&JSON.stringify(board.runners)===JSON.stringify(original.runners))delete draft.boardAnimation.runnerStarts;
  if(!source.boardAnimation?.running&&JSON.stringify(board.running)===JSON.stringify(original.running))delete draft.boardAnimation.running;
  return draft;
}
export function syncSituationAnimation(situation) {
  if(!situation)return null;
  const draft=clone(situation);
  if(draft.boardAnimation){
    const { running, runnerStarts, steps, throwSteps, throwTimings, timingProfile } = draft.boardAnimation;
    const board=fromSituation(draft,{coachBoard:true});
    draft.boardAnimation={
      version:2,
      movements:board.movements,
      battedBall:board.battedBall,
      ...(running && {running:board.running}),
      ...(runnerStarts && {runnerStarts:board.runners}),
      ...(steps !== undefined && {steps:board.steps}),
      ...(throwSteps !== undefined && {throwSteps:board.throwSteps}),
      ...(timingProfile !== undefined && {timingProfile:board.timingProfile}),
      ...(throwTimings !== undefined && {throwTimings:board.throwTimings})
    };
  }
  return draft;
}
export function animationIssues(situation) {
  if(!situation?.boardAnimation)return [];
  if(![1,2].includes(situation.boardAnimation.version))return [{message:'Unsupported instructional animation version.',section:'sbTargetsSubsec',severity:'error'}];
  try{
    compilePlay(fromSituation(situation));
    const {running, runnerStarts}=situation.boardAnimation;
    if(running!==undefined||runnerStarts!==undefined||situation.boardAnimation.steps!==undefined){
      const board=fromSituation(situation,{coachBoard:true});
      // Validate the optional source fields before reconciling them with Situation occupancy.
      if(runnerStarts!==undefined&&(!runnerStarts||typeof runnerStarts!=='object'||Array.isArray(runnerStarts)))throw new Error('Invalid runner starting positions.');
      if(running!==undefined&&(!running||typeof running!=='object'||Array.isArray(running)))throw new Error('Invalid automatic running settings.');
      const issues=validateBoard({...board,running,runners:{...board.runners,...runnerStarts},movements:{}});
      if(issues.length)throw new Error(issues.join(' '));
      compilePlay(board,{coachBoard:true});
    }
    return [];
  }catch(error){return [{message:`Instructional movement: ${error.message}`,section:'sbTargetsSubsec',severity:'error'}];}
}

// Per-tab, per-user navigation transfer; never an intermediate database record.
export const HANDOFF_KEY='diq-situation-authoring-v1';
export function writeHandoff(storage,userId,destination,situation,baseline=situation,rationale='') {
  if(!userId||!situation?.key)throw new Error('Log in before switching Situation editors.');
  storage.setItem(HANDOFF_KEY,JSON.stringify({version:1,userId,destination,situation:syncSituationAnimation(situation),baseline:clone(baseline),rationale,createdAt:Date.now()}));
}
export function readHandoff(storage,userId,destination) {
  const raw=storage.getItem(HANDOFF_KEY);if(!raw)return null;
  let value;try{value=JSON.parse(raw);}catch{storage.removeItem(HANDOFF_KEY);return null;}
  if(value.version!==1||value.userId!==userId||Date.now()-value.createdAt>24*60*60*1000){storage.removeItem(HANDOFF_KEY);return null;}
  return value.destination===destination&&value.situation?.key?value:null;
}
export function clearHandoff(storage){storage.removeItem(HANDOFF_KEY);}

export function situationPlayIssues(situation) {
  const issues=[];
  const add=(message,section)=>issues.push({message,section,severity:'error'});
  const point=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&p.x>=0&&p.x<=3200&&p.y>=0&&p.y<=2133;
  for(const id of POSITIONS){
    if(!point(situation?.starts?.[id]))add(`${id}: set a starting position within the field.`,'sbTargetsSubsec');
    if(!point(situation?.targets?.[id]))add(`${id}: set a target position within the field.`,'sbTargetsSubsec');
    if(!Number.isFinite(Number(situation?.targets?.[id]?.tol))||Number(situation.targets[id].tol)<5)add(`${id}: set a valid target tolerance.`,'sbTargetsSubsec');
  }
  if(POSITIONS.every(id=>situation?.targets?.[id]?.enabled===false))add('Enable at least one scoring target.','sbTargetsSubsec');
  if(!point(situation?.hit))add('Set the ball landing spot within the field.','sbBallHitSubsec');
  if(![0,1,2].includes(situation?.outs))add('Choose 0, 1, or 2 starting outs.','sbRunnersSubsec');
  for(const field of ['playSeq','playSeq2']){
    const seq=situation?.[field]||[];
    if(!Array.isArray(seq)||seq.length===1||seq.length>30||seq.some(id=>!POSITIONS.includes(id)))add(`Use an empty ${field==='playSeq'?'primary':'secondary'} sequence or at least two valid defensive positions.`,'seqSubsec');
  }
  return [...issues,...animationIssues(situation)];
}
