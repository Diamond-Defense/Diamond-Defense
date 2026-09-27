import type { Situation, SituationAudience } from './models';

export const BALL_LOCATIONS = ['LF', 'Shallow LF', 'Deep LF', 'LF Line', 'Left-Center', 'CF', 'Shallow CF', 'Deep CF', 'Right-Center', 'RF', 'Shallow RF', 'Deep RF', 'RF Line', 'Third Base', 'Shortstop', 'Second Base', 'First Base', 'Pitcher', 'Catcher'] as const;
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
  const type = ({line:'Line Drive', grounder:'Ground Ball', popup:'Fly Ball'} as Record<string,string>)[situation.hitType] || 'Ball in Play';
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
