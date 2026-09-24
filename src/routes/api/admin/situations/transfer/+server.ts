import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { POSITION_IDS, type Situation } from '$lib/domain/models';
import { databaseFor } from '$lib/server/database/context';
import { SqliteSituationRepository, validateSituation } from '$lib/server/repositories/situations';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

const fields = ['key', 'title', 'desc', 'category', 'difficulty', 'primaryCategory', 'relatedCategories', 'outs', 'runnersOn', 'starts', 'targets', 'hit', 'hitType', 'batterAdvance', 'playOutcome', 'runnerOutcomes', 'playSeq', 'playSeq2', 'seqNote'] as const;
function editable(value: Situation): Situation {
  return Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]])) as unknown as Situation;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + stable(item)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
function validateGeometry(value: Situation) {
  const point = (p: { x: number; y: number }) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  if (!point(value.hit) || !POSITION_IDS.every(id => point(value.starts?.[id]) && point(value.targets?.[id]) && Number.isFinite(value.targets[id].tol) && value.targets[id].tol > 0)) throw new Error('Every position needs valid starting coordinates, targets, and tolerance; the ball needs valid coordinates.');
  if (![0, 1, 2].includes(value.outs) || !['first', 'second', 'third'].every(key => typeof value.runnersOn?.[key as keyof typeof value.runnersOn] === 'boolean')) throw new Error('Starting runners or outs are invalid.');
  if (!['line', 'popup', 'grounder'].includes(value.hitType) || !Number.isFinite(value.batterAdvance)) throw new Error('Ball type or batter advance is invalid.');
  for (const sequence of [value.playSeq, value.playSeq2 ?? []]) if (!Array.isArray(sequence) || sequence.some(id => !POSITION_IDS.includes(id))) throw new Error('Throw sequence is invalid.');
}
export const GET: RequestHandler = async (event) => {
  await requireUser(event, ['admin']);
  const records = await new SqliteSituationRepository(databaseFor(event)).list();
  return json({ format: 'diamond-defence-situations', version: 1, source: event.url.origin, exportedAt: new Date().toISOString(), situations: records.map(record => ({ ...editable(record), displayCode: record.displayCode })) }, { headers: { 'Cache-Control': 'no-store' } });
};
export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  await requireUser(event, ['admin']);
  const text = await event.request.text();
  if (text.length > 5_000_000) return json({ error: 'Situation file must be smaller than 5 MB.' }, { status: 400 });
  let bundle;
  try { bundle = JSON.parse(text); } catch { return json({ error: 'Choose a valid situation JSON file.' }, { status: 400 }); }
  if (bundle?.format !== 'diamond-defence-situations' || bundle.version !== 1 || !Array.isArray(bundle.situations) || !bundle.situations.length || bundle.situations.length > 1000) return json({ error: 'Unsupported or empty situation export (maximum 1,000 situations).' }, { status: 400 });
  const records = await new SqliteSituationRepository(databaseFor(event)).list(true);
  const rows = bundle.situations.map((input: Situation) => {
    const key = String(input?.key ?? '');
    try {
      if (bundle.situations.filter((item: Situation) => item?.key === key).length !== 1) throw new Error('Duplicate situation key in file.');
      if (input.displayCode && bundle.situations.filter((item: Situation) => item?.displayCode === input.displayCode).length !== 1) throw new Error('Duplicate display code in file.');
      const situation = editable(validateSituation(editable(input)));
      validateGeometry(situation);
      const current = records.find(record => record.key === key);
      if (current?.active === false) throw new Error('This key belongs to an archived situation. Resolve it before importing.');
      if (input.displayCode && records.some(record => record.displayCode === input.displayCode && record.key !== key)) throw new Error('This display code belongs to a different situation in this environment.');
      const changes = fields.filter(field => field !== 'key' && stable(current?.[field]) !== stable(situation[field])).map(field => ({ field, before: current?.[field] ?? null, after: situation[field] ?? null }));
      return { key, title: situation.title, status: current ? (changes.length ? 'changed' : 'unchanged') : 'new', revision: current?.revision, situation, changes };
    } catch (error) { return { key, title: String(input?.title ?? key), status: 'conflict', error: error instanceof Error ? error.message : 'Invalid situation.' }; }
  });
  return json({ source: String(bundle.source ?? 'Unknown environment'), destination: event.url.origin, rows }, { headers: { 'Cache-Control': 'no-store' } });
};
