import { clone, fromSituation, POSITIONS } from './board.js';
import { compilePlay } from './animation.js';

// Situation owns identity, correctness, outcomes and details. Board is its spatial projection.
export function situationDraft(board, source = board.sourceSituation) {
  if (!source?.key) throw new Error('Open a Situation before saving Situation changes.');
  const draft=clone(source);
  draft.title=board.title;draft.outs=Number(board.outs);draft.starts=clone(board.defenders);
  draft.runnersOn=Object.fromEntries(['first','second','third'].map(base=>[base,!!board.runners[base]]));
  draft.targets=Object.fromEntries(POSITIONS.map(id=>{
    const end=board.movements[id]?.at(-1)?.path.at(-1) || source.targets?.[id] || board.defenders[id];
    return [id,{...clone(source.targets?.[id]||{}),x:end.x,y:end.y}];
  }));
  draft.playSeq=clone(board.playSeq);draft.playSeq2=clone(board.playSeq2);
  if(board.battedBall){draft.hit=clone(board.battedBall.destination);draft.hitType={ground_ball:'grounder',line_drive:'line',fly_ball:'popup',pop_fly:'popup'}[board.battedBall.type];}
  draft.boardAnimation={version:2,movements:clone(board.movements),battedBall:clone(board.battedBall)};
  return draft;
}
export function syncSituationAnimation(situation) {
  if(!situation)return null;
  const draft=clone(situation);
  if(draft.boardAnimation){
    const board=fromSituation(draft);
    draft.boardAnimation={version:2,movements:board.movements,battedBall:board.battedBall};
  }
  return draft;
}
export function animationIssues(situation) {
  if(!situation?.boardAnimation)return [];
  if(![1,2].includes(situation.boardAnimation.version))return [{message:'Unsupported instructional animation version.',section:'sbTargetsSubsec',severity:'error'}];
  try{compilePlay(fromSituation(situation));return [];}catch(error){return [{message:`Instructional movement: ${error.message}`,section:'sbTargetsSubsec',severity:'error'}];}
}

// Per-tab, per-user navigation transfer; never an intermediate database record.
export const HANDOFF_KEY='diq-situation-authoring-v1';
export function writeHandoff(storage,userId,destination,situation,baseline=situation,rationale='') {
  if(!userId||!situation?.key)throw new Error('Sign in before switching Situation editors.');
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
  if(!point(situation?.hit))add('Set the ball landing spot within the field.','sbBallHitSubsec');
  if(![0,1,2].includes(situation?.outs))add('Choose 0, 1, or 2 starting outs.','sbRunnersSubsec');
  for(const field of ['playSeq','playSeq2']){
    const seq=situation?.[field]||[];
    if(!Array.isArray(seq)||seq.length===1||seq.length>30||seq.some(id=>!POSITIONS.includes(id)))add(`Use an empty ${field==='playSeq'?'primary':'secondary'} sequence or at least two valid defensive positions.`,'seqSubsec');
  }
  return [...issues,...animationIssues(situation)];
}
