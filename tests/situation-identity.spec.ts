import { test, expect } from '@playwright/test';
import { suggestSituationName, normalizeAudience, situationIdentity, normalizeSuggestedDivisions } from '../src/lib/domain/situation-identity';
import type { Situation } from '../src/lib/domain/models';

const fixture = {key:'example',title:'Ground Ball to LF',hitType:'grounder',ballLocation:'LF',runnersOn:{first:false,second:true,third:false}} as Situation;
test('names describe starting facts without revealing the solution', () => {
  const name = suggestSituationName({...fixture,playSeq:['LF','C'],batterAdvance:4});
  expect(name).toBe('Ground Ball to LF — Runner on Second');
  expect(suggestSituationName({...fixture,playSeq:['LF','SS'],batterAdvance:1})).toBe(name);
});
test('identity normalizes names and default variants while distinguishing staff labels', () => {
  expect(situationIdentity({...fixture,title:'  GROUND  Ball to LF ',audience:{staffVariant:' Standard '}})).toBe(situationIdentity(fixture));
  expect(situationIdentity({...fixture,audience:{ageMin:13}})).toBe(situationIdentity(fixture));
  expect(situationIdentity({...fixture,audience:{teamId:'black'}})).toBe(situationIdentity(fixture));
  expect(situationIdentity({...fixture,audience:{baseDistance:90}})).toBe(situationIdentity(fixture));
});
test('retired metadata is ignored and staff labels distinguish variants', () => {
  expect(normalizeAudience({baseDistance:90,pitchingDistance:60.5,ageMin:13,teamId:'old'})).toEqual({});
  expect(situationIdentity({...fixture,audience:{staffVariant:'Alternate approach'}})).not.toBe(situationIdentity(fixture));
  expect(() => normalizeAudience({staffVariant:'x'.repeat(81)})).toThrow();
});

test('suggested divisions are optional discovery tags from 9U through 18U',()=>{
 expect(normalizeSuggestedDivisions(undefined)).toEqual([]);
 expect(normalizeSuggestedDivisions([14,11,14])).toEqual([11,14]);
 for(const value of [[8],[19],[11.5],['11'],null])expect(()=>normalizeSuggestedDivisions(value)).toThrow();
});
