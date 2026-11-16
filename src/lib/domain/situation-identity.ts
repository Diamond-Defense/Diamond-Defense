import { BASES_NATIVE, DEFAULT_STARTS } from '../plays/field.js';
import type { Situation, SituationAudience } from './models';

export const BALL_LOCATIONS = ['LF', 'Shallow LF', 'Deep LF', 'LF Line', 'Left-Center', 'CF', 'Shallow CF', 'Deep CF', 'Right-Center', 'RF', 'Shallow RF', 'Deep RF', 'RF Line', 'Third Base', 'Shortstop', 'Second Base', 'First Base', 'Pitcher', 'Catcher'] as const;
type BallLocation = (typeof BALL_LOCATIONS)[number];
const ballLocationAnchors = {
  LF: DEFAULT_STARTS.LF,
  'Shallow LF': { x: 890, y: 850 },
  'Deep LF': { x: 640, y: 460 },
  'LF Line': { x: 480, y: 830 },
  'Left-Center': { x: 1160, y: 500 },
  CF: DEFAULT_STARTS.CF,
  'Shallow CF': { x: 1570, y: 685 },
  'Deep CF': { x: 1570, y: 300 },
  'Right-Center': { x: 1980, y: 500 },
  RF: DEFAULT_STARTS.RF,
  'Shallow RF': { x: 2250, y: 850 },
  'Deep RF': { x: 2500, y: 460 },
  'RF Line': { x: 2660, y: 830 },
  'Third Base': BASES_NATIVE.third,
  Shortstop: DEFAULT_STARTS.SS,
  'Second Base': DEFAULT_STARTS['2B'],
  'First Base': BASES_NATIVE.first,
  Pitcher: DEFAULT_STARTS.P,
  Catcher: BASES_NATIVE.home
} satisfies Record<BallLocation, Situation['hit']>;

export function inferBallLocation(hit: Situation['hit']): BallLocation {
  let closest: BallLocation = BALL_LOCATIONS[0];
  let nearestDistance = Infinity;
  for (const location of BALL_LOCATIONS) {
    const anchor = ballLocationAnchors[location];
    const distance = Math.hypot(anchor.x - hit.x, anchor.y - hit.y);
    if (distance < nearestDistance) {
      closest = location;
      nearestDistance = distance;
    }
  }
  return closest;
}

export function normalizedName(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}
export function normalizeAudience(value: SituationAudience = {}): SituationAudience {
  const result: SituationAudience = {};
  const variant = String(value.staffVariant ?? '').trim().replace(/\s+/g, ' ');
  if (variant.length > 80) throw new Error('Staff label must be 80 characters or fewer.');
  if (variant && normalizedName(variant) !== 'standard') result.staffVariant = variant;
  return result;
}
export function situationIdentity(situation: Situation): string {
  return JSON.stringify(['situation', situation.key]);
}
export function suggestSituationName(situation: Situation): string {
  const type = situation.boardAnimation?.battedBall?.type === 'pop_fly' ? 'Pop Fly' : ({line:'Line Drive', grounder:'Ground Ball', popup:'Fly Ball'} as Record<string,string>)[situation.hitType] || 'Ball in Play';
  const bases = [['first','First'],['second','Second'],['third','Third']].filter(([key]) => situation.runnersOn?.[key as keyof Situation['runnersOn']]).map(([,label]) => label);
  const runners = bases.length === 3 ? 'Bases Loaded' : bases.length === 0 ? 'Bases Empty' : `${bases.length === 1 ? 'Runner' : 'Runners'} on ${bases.join(' and ')}`;
  return `${type}${situation.ballLocation ? ` to ${situation.ballLocation}` : ''} — ${runners}`;
}
export function audienceLabel(situation: Situation): string {
  return normalizeAudience(situation.audience).staffVariant || '';
}

export function normalizeSuggestedDivisions(value: unknown): number[] {
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.some(age=>!Number.isInteger(age)||age<9||age>18))throw new Error('Suggested divisions must be from 9U through 18U.');
 return [...new Set(value)].sort((a,b)=>a-b);
}

export function variationGroup(situation: Situation): string {
  const bases = [['first','First'],['second','Second'],['third','Third']].filter(([key]) => situation.runnersOn?.[key as keyof Situation['runnersOn']]).map(([,label]) => label);
  const runners = bases.length === 3 ? 'Bases Loaded' : bases.length === 0 ? 'Bases Empty' : `${bases.length === 1 ? 'Runner' : 'Runners'} on ${bases.join(' and ')}`;
  const suffix = ` — ${runners}`;
  const title = situation.title.endsWith(suffix) ? situation.title.slice(0,-suffix.length) : situation.title;
  // Match SQLite lower(trim(...)): only ASCII case and surrounding spaces.
  const name = title.replace(/^ +| +$/g, '').replace(/[A-Z]/g, letter => letter.toLowerCase());
  const basesMask = (situation.runnersOn?.first ? 1 : 0) + (situation.runnersOn?.second ? 2 : 0) + (situation.runnersOn?.third ? 4 : 0);
  const location = situation.ballLocation || `point:${Math.round(Number(situation.hit?.x || 0) * 1000)},${Math.round(Number(situation.hit?.y || 0) * 1000)}`;
  return JSON.stringify(['starting-state-v2', name, basesMask, Number(situation.outs || 0), situation.hitType || '', location]);
}
