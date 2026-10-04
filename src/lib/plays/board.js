import { startCondition, reconcileSegments, MAX_SEGMENTS, throwLegs, distance } from './segments.js';
import { createOffenseNumbers } from './token-presentation.js';
import { DEFAULT_STARTS, BASES_NATIVE, IMG_W, IMG_H, DEFAULT_TOL } from './field.js';
export const POSITIONS = Object.keys(DEFAULT_STARTS);
export const BALL_TYPES = ['ground_ball', 'line_drive', 'fly_ball', 'pop_fly'];
export const clone = value => JSON.parse(JSON.stringify(value));
export function newBoard() {
  return { version: 2, offenseNumbers: createOffenseNumbers(), title: 'Untitled Board', outs: 0, defenders: clone(DEFAULT_STARTS), runners: {}, movements: {}, battedBall: null, playSeq: [], playSeq2: [], animation: { version: 2 }, sourceSituation: null };
}
export function upgradeBoard(value) {
  if(!value || ![1,2].includes(value.version))throw new Error('Unsupported Board version.');
  const board=clone(value);
  const legacy=board.version===1;
  board.version=2;board.animation={version:2};board.offenseNumbers ||= createOffenseNumbers();
  board.playSeq2 ||= [];
  for(const [id,segments] of Object.entries(board.movements||{})) {
    for(let i=0;i<segments.length;i++)segments[i].start=startCondition(segments[i],i);
    if(legacy)reconcileSegments(board,id);
  }
  return board;
}
export function validateBoard(board) {
  const issues = [];
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= IMG_W && p.y >= 0 && p.y <= IMG_H;
  if (!board || ![1,2].includes(board.version)) return ['Unsupported Board version.'];
  if (typeof board.title !== 'string' || !board.title.trim() || board.title.length > 120) issues.push('Enter a Board name of 1–120 characters.');
  if (![0, 1, 2].includes(board.outs)) issues.push('Choose 0, 1, or 2 outs.');
  if (!POSITIONS.every(id => point(board.defenders?.[id]))) issues.push('Set valid starting positions for all nine defenders.');
  if (!record(board.runners) || Object.entries(board.runners).some(([id, p]) => !['batter', 'first', 'second', 'third'].includes(id) || !point(p))) issues.push('Invalid runner starting positions.');
  if (!record(board.movements)) issues.push('Invalid movement data.');
  else for(const [id,segments] of Object.entries(board.movements)) {
    if(!(POSITIONS.includes(id)||board.runners?.[id]) || !Array.isArray(segments) || !segments.length || segments.length>MAX_SEGMENTS){issues.push(`Invalid movements for ${id}.`);continue;}
    for(let i=0;i<segments.length;i++) {
      const segment=segments[i],path=segment?.path;
      if(!Array.isArray(path)||path.length<2||path.length>512||!path.every(point)){issues.push(`Invalid path for ${id} movement ${i+1}.`);continue;}
      const start=startCondition(segment,i);
      if(!['contact','previous_movement','ball_fielded','throw_started','throw_received'].includes(start.event) || (start.event==='previous_movement'&&!i)) issues.push(`Choose a valid start event for ${id} movement ${i+1}.`);
      if(['throw_started','throw_received'].includes(start.event) && (!Number.isSafeInteger(start.throwIndex)||start.throwIndex<1||start.throwIndex>throwLegs(board).length)) issues.push(`${id} movement ${i+1} references an unavailable throw. Update its start event.`);
      const previous=i?segments[i-1]?.path?.at(-1):board.defenders?.[id]||board.runners?.[id];
      if(board.version===2&&point(previous)&&distance(path[0],previous)>0.01)issues.push(`${id} movement ${i+1} must start where the preceding movement ends.`);
    }
  }
  const pointCount=Object.values(board.movements||{}).reduce((sum,segments)=>sum+(Array.isArray(segments)?segments.reduce((n,segment)=>n+(segment?.path?.length||0),0):0),0);
  if(pointCount>20000)issues.push('Too many movement points. Re-record shorter routes.');
  if (board.battedBall && (!BALL_TYPES.includes(board.battedBall.type) || !point(board.battedBall.start) || !point(board.battedBall.destination))) issues.push('Invalid batted ball.');
  for (const seq of [board.playSeq, board.playSeq2]) if (!Array.isArray(seq) || seq.length > 30 || !seq.every(id => POSITIONS.includes(id))) issues.push('Use defensive positions for throws.');
  return issues;
}
export function fromSituation(situation) {
  const b = newBoard();
  b.title = situation.title; b.outs = situation.outs; b.sourceSituation = clone(situation);
  b.defenders = { ...b.defenders, ...clone(situation.starts || {}) };
  for (const base of ['first','second','third']) if (situation.runnersOn?.[base]) b.runners[base] = clone(BASES_NATIVE[base]);
  b.runners.batter = clone(BASES_NATIVE.home);
  for (const id of POSITIONS) {
    const end = situation.targets?.[id];
    if (end) b.movements[id] = [{ path: [b.defenders[id], { x: end.x, y: end.y }] }];
  }
  const bases = ['home','first','second','third','home'];
  const batterDestination = situation.playOutcome?.batterResult || ['out','first','second','third','home'][situation.batterAdvance||0];
  const endIndex = batterDestination === 'home' ? 4 : bases.indexOf(batterDestination);
  if(batterDestination==='out')b.movements.batter=[{path:[clone(BASES_NATIVE.home),{x:BASES_NATIVE.home.x+(BASES_NATIVE.first.x-BASES_NATIVE.home.x)*0.8,y:BASES_NATIVE.home.y+(BASES_NATIVE.first.y-BASES_NATIVE.home.y)*0.8}]}];
  if (endIndex > 0) b.movements.batter = [{ path: bases.slice(0,endIndex+1).map(base=>clone(BASES_NATIVE[base])) }];
  for (const outcome of situation.runnerOutcomes || []) {
    const start = bases.indexOf(outcome.startingBase), end = outcome.result === 'home' ? 4 : bases.indexOf(outcome.result);
    if(outcome.result==='out'&&b.runners[outcome.startingBase]){const from=b.runners[outcome.startingBase],to=BASES_NATIVE[bases[start+1]],fraction={force:0.96,tag:0.68,catch:0.2}[outcome.outType]||0.76;b.movements[outcome.startingBase]=[{path:[clone(from),{x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction}]}];}
    if (end > start && b.runners[outcome.startingBase]) b.movements[outcome.startingBase] = [{path:bases.slice(start,end+1).map(base=>clone(BASES_NATIVE[base]))}];
  }
  b.battedBall = situation.hit ? { type: { grounder:'ground_ball', line:'line_drive', popup:'pop_fly' }[situation.hitType] || 'ground_ball', start:clone(BASES_NATIVE.home), destination:clone(situation.hit) } : null;
  b.playSeq = clone(situation.playSeq || []); b.playSeq2 = clone(situation.playSeq2 || []);
  // Optional instructional metadata never replaces correctness targets.
  if ([1,2].includes(situation.boardAnimation?.version)) {
    b.movements = {...b.movements,...clone(situation.boardAnimation.movements)};
    b.battedBall = clone(situation.boardAnimation.battedBall);
  }
  if(b.battedBall&&situation.hit)b.battedBall.destination=clone(situation.hit);
  const canonicalType={grounder:'ground_ball',line:'line_drive',popup:'pop_fly'}[situation.hitType];
  if(b.battedBall&&canonicalType&&({ground_ball:'grounder',line_drive:'line',fly_ball:'popup',pop_fly:'popup'}[b.battedBall.type]!==situation.hitType))b.battedBall.type=canonicalType;
  for(const id of Object.keys(b.movements)) {
    if(!b.defenders[id]&&!b.runners[id]){delete b.movements[id];continue;}
    reconcileSegments(b,id);
    const target=situation.targets?.[id];
    if(target)b.movements[id].at(-1).path[b.movements[id].at(-1).path.length-1]={x:target.x,y:target.y};
  }
  return upgradeBoard(b);
}
export function toSituation(board, metadata) {
  const issues = validateBoard(board);
  if (!board.battedBall) issues.push('Set the batted-ball destination before saving as a Situation.');
  if (board.playSeq.length < 2) issues.push('Define a defensive throw sequence with at least two positions.');
  if (!metadata?.playOutcome || metadata.playOutcome.reviewStatus !== 'ready') issues.push('Confirm the play and runner outcomes before publishing.');
  if (issues.length) throw new Error(issues.join('\n'));
  const targets = Object.fromEntries(POSITIONS.map(id => {
    const path = board.movements[id]?.at(-1)?.path;
    return [id, { ...(path?.at(-1) || board.defenders[id]), tol: board.sourceSituation?.targets?.[id]?.tol || DEFAULT_TOL }];
  }));
  return { ...metadata, key: `board-${crypto.randomUUID()}`, title:board.title, desc:metadata.desc || '', category:metadata.category || 'Coach Board', difficulty:metadata.difficulty || 'foundational', primaryCategory:metadata.primaryCategory || 'base-coverage', relatedCategories:metadata.relatedCategories || [], outs:board.outs, runnersOn:Object.fromEntries(['first','second','third'].map(base=>[base,!!board.runners[base]])), starts:clone(board.defenders), targets, hit:clone(board.battedBall.destination), hitType:{ground_ball:'grounder',line_drive:'line',fly_ball:'popup',pop_fly:'popup'}[board.battedBall.type], playSeq:clone(board.playSeq), playSeq2:clone(board.playSeq2), batterAdvance:{out:0,first:1,second:2,third:3,home:4}[metadata.playOutcome.batterResult], boardAnimation:{version:2,movements:clone(board.movements),battedBall:clone(board.battedBall)} };
}
// Bounded sampling + corner-preserving simplification, then a gentle local filter.
export function cleanPath(points) {
  if (points.length < 2) return points;
  const sampled = [points[0]];
  for (const p of points.slice(1,-1)) if (Math.hypot(p.x-sampled.at(-1).x,p.y-sampled.at(-1).y) >= 8) sampled.push(p);
  sampled.push(points.at(-1));
  const stride = Math.max(1,Math.ceil(sampled.length/500));
  const bounded = sampled.filter((_,i)=>i===0 || i===sampled.length-1 || i%stride===0);
  return bounded.map((p,i)=>i===0 || i===bounded.length-1 ? p : {x:(bounded[i-1].x+p.x*6+bounded[i+1].x)/8,y:(bounded[i-1].y+p.y*6+bounded[i+1].y)/8});
}
