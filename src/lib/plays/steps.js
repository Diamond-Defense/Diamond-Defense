import { conditionValue, reconcileSegments, throwLegs } from './segments.js';

// A legacy play can have 58 throw legs, with a start and receipt for each.
export const MAX_STEPS = 150;
export const isAuthoredStep = id => id.startsWith('step-');
const labels = {
  pre_pitch: 'Before the pitch',
  pitch_started: 'During the pitch',
  contact: 'Contact',
  ball_fielded: 'Ball fielded',
  previous_movement: 'Follow-up movement'
};

export function playSteps(board) {
  if (board.steps) {
    const ids = new Set(board.steps.map(step => step.id));
    const extraThrows = throwLegs(board).filter(leg =>
      !board.throwSteps?.[leg.index-1] && !ids.has(`throw_started:${leg.index}`));
    return [...board.steps, ...extraThrows.map(leg=>({
      id:`throw_started:${leg.index}`,name:`${leg.from} → ${leg.to}`
    }))];
  }
  const events = new Set(Object.values(board.movements).flatMap(segments =>
    segments.flatMap((segment,index) => segment.stepId ? [] : [conditionValue(segment,index)])));
  if (board.battedBall && !board.battedBall.stepId) events.add('contact');
  const entries = ['pre_pitch', 'pitch_started', 'contact', 'ball_fielded'].map(event => ({id:event, name:labels[event]}));
  for (const leg of throwLegs(board)) {
    entries.push(
      {id:`throw_started:${leg.index}`, name:`${leg.from} → ${leg.to}`},
      {id:`throw_received:${leg.index}`, name:`${leg.to} receives throw ${leg.index}`}
    );
    if (!board.throwSteps?.[leg.index-1]) events.add(`throw_started:${leg.index}`);
  }
  entries.push({id:'previous_movement', name:labels.previous_movement});
  return entries.filter(step => events.has(step.id));
}

export function movementStep(segment, index, steps) {
  const id = segment.stepId || conditionValue(segment, index);
  return steps.some(step => step.id === id) ? id : null;
}

export function throwStep(board, index, steps = playSteps(board)) {
  const id = board.throwSteps?.[index - 1] || `throw_started:${index}`;
  return steps.some(step => step.id === id) ? id : null;
}

export function hitStep(board, steps = playSteps(board)) {
  if (!board.battedBall) return null;
  const id = board.battedBall.stepId || 'contact';
  return steps.some(step => step.id === id) ? id : null;
}

export function stepPositions(board, id, steps = playSteps(board)) {
  const positions = {...board.defenders, ...board.runners};
  const current = steps.findIndex(step => step.id === id);
  for (const [actor, segments] of Object.entries(board.movements)) {
    segments.forEach((segment, index) => {
      const order = steps.findIndex(step => step.id === movementStep(segment, index, steps));
      if (order >= 0 && order <= current) positions[actor] = segment.path.at(-1);
    });
  }
  return positions;
}

export function stepMovementIndex(segments, id, steps) {
  const existing = segments.findIndex((segment,index) => movementStep(segment,index,steps) === id);
  if (existing >= 0) return existing;
  const order = steps.findIndex(step => step.id === id);
  const next = segments.findIndex((segment,index) =>
    steps.findIndex(step => step.id === movementStep(segment,index,steps)) > order);
  return next < 0 ? segments.length : next;
}

export function removeStep(board, id) {
  const steps = playSteps(board);
  const order = steps.findIndex(step => step.id === id);
  const replacement = steps[order - 1] || steps[order + 1];
  if (!replacement) {
    board.steps = [];
    board.movements = {};
    board.battedBall = null;
    board.playSeq = [];
    board.playSeq2 = [];
    delete board.throwSteps;
    board.running = {result:'single',destinations:{}};
    return;
  }
  // Carry the hit and throws forward when another editable step remains.
  if (hitStep(board,steps) === id) board.battedBall.stepId = replacement.id;
  {
    const links = throwLegs(board).map(leg => throwStep(board,leg.index,steps) === id ? replacement.id : board.throwSteps?.[leg.index-1] || null);
    if (links.some(Boolean)) board.throwSteps = links;
  }
  for (const [actor, segments] of Object.entries(board.movements)) {
    const remaining = segments.filter((segment,index) => movementStep(segment,index,steps) !== id);
    if (!remaining.length) delete board.movements[actor];
    else {
      board.movements[actor] = remaining;
      if (remaining[0].start?.event === 'previous_movement') remaining[0].start = {event:'contact'};
      reconcileSegments(board,actor);
    }
  }
  board.steps = steps.filter(step => step.id !== id);
}

export function stepIssues(board) {
  const {steps, throwSteps} = board;
  if (steps !== undefined && (!Array.isArray(steps) || steps.length > MAX_STEPS ||
    steps.some(step => !step || typeof step.id !== 'string' || !/^[\w:-]{1,64}$/.test(step.id) ||
      (step.timing!==undefined&&step.timing!=='pre_pitch') || typeof step.name !== 'string' || !step.name.trim() || step.name.length > 80) ||
    new Set(steps.map(step => step.id)).size !== steps.length)) return ['Invalid play steps.'];
  const ids = new Set((steps || []).map(step => step.id));
  const invalid = id => id !== undefined && !ids.has(id);
  if (invalid(board.battedBall?.stepId) ||
    Object.values(board.movements || {}).some(segments => Array.isArray(segments) && segments.some(segment => invalid(segment?.stepId) || segment?.start?.event==='step' && !ids.has(segment.stepId)))) {
    return ['An action references an unavailable step.'];
  }
  if (throwSteps !== undefined && (!Array.isArray(throwSteps) || throwSteps.length > [board.playSeq,board.playSeq2].reduce((count,sequence)=>count+(Array.isArray(sequence)?Math.max(0,sequence.length-1):0),0) ||
    throwSteps.some(id => id !== null && !ids.has(id)))) return ['A throw references an unavailable step.'];
  return [];
}
