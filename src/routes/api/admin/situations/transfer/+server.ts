import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { POSITION_IDS, type Situation } from '$lib/domain/models';
import { databaseFor } from '$lib/server/database/context';
import { SqliteSituationRepository, validateSituation } from '$lib/server/repositories/situations';
import { RecordValidationError } from '$lib/server/repositories/errors';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { designWorkspaces, type LibraryScope } from '$lib/server/security/design-scopes';
import { expectedRevision } from '$lib/server/http/revisions';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';

const fields = ['key', 'variationNumber', 'variationTagVersion', 'variationTagged', 'variationSourceKey', 'title', 'desc', 'audience', 'suggestedDivisions', 'ballLocation', 'category', 'difficulty', 'primaryCategory', 'relatedCategories', 'outs', 'runnersOn', 'starts', 'targets', 'hit', 'hitType', 'boardAnimation', 'batterAdvance', 'playOutcome', 'runnerOutcomes', 'playSeq', 'playSeq2', 'seqNote'] as const;
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
  if (!point(value.hit) || !POSITION_IDS.every(id => point(value.starts?.[id]) && point(value.targets?.[id]) && Number.isFinite(value.targets[id].tol) && value.targets[id].tol > 0)) throw new RecordValidationError('Every position needs valid starting coordinates, targets, and tolerance; the ball needs valid coordinates.');
  if (![0, 1, 2].includes(value.outs) || !['first', 'second', 'third'].every(key => typeof value.runnersOn?.[key as keyof typeof value.runnersOn] === 'boolean')) throw new RecordValidationError('Starting runners or outs are invalid.');
  if (!['line', 'popup', 'grounder'].includes(value.hitType) || !Number.isFinite(value.batterAdvance)) throw new RecordValidationError('Ball type or batter advance is invalid.');
  for (const sequence of [value.playSeq, value.playSeq2 ?? []]) if (!Array.isArray(sequence) || sequence.some(id => !POSITION_IDS.includes(id))) throw new RecordValidationError('Throw sequence is invalid.');
}
async function importDestination(event: Parameters<RequestHandler>[0], user: Awaited<ReturnType<typeof requireUser>>) {
  const type = event.url.searchParams.get('type') ?? 'global';
  const id = event.url.searchParams.get('id') ?? '';
  if (!['global','organization','region'].includes(type)) return undefined;
  return (await designWorkspaces(databaseFor(event),user)).find(scope => scope.type === type && scope.id === id);
}

async function scopedImportKey(scope: LibraryScope, key: string) {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([scope.type,scope.id,key])));
  return 'import-' + Array.from(new Uint8Array(bytes),byte => byte.toString(16).padStart(2,'0')).join('');
}

export const GET: RequestHandler = async (event) => {
  await requireUser(event, ['admin']);
  const records = await new SqliteSituationRepository(databaseFor(event)).list();
  return json({ format: 'diamond-defence-situations', version: 1, source: event.url.origin, exportedAt: new Date().toISOString(), situations: records.map(record => ({ ...editable(record), displayCode: record.displayCode })) }, { headers: { 'Cache-Control': 'no-store' } });
};
export const POST: RequestHandler = async (event) => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin']);
  const scope = await importDestination(event,user);
  if (!scope) return json({error:'Choose an existing Global, Organization, or Regional Library.'},{status:400});
  const text = await event.request.text();
  if (text.length > 5_000_000) return json({ error: 'Situation file must be smaller than 5 MB.' }, { status: 400 });
  let bundle;
  try { bundle = JSON.parse(text); } catch { return json({ error: 'Choose a valid situation JSON file.' }, { status: 400 }); }
  if (bundle?.format !== 'diamond-defence-situations' || bundle.version !== 1 || !Array.isArray(bundle.situations) || !bundle.situations.length || bundle.situations.length > 1000) return json({ error: 'Unsupported or empty situation export (maximum 1,000 situations).' }, { status: 400 });
  const db = databaseFor(event);
  const [records, elsewhere] = await Promise.all([
    new SqliteSituationRepository(db).list(true,scope),
    db.all<{key:string;title:string;active:number}>(
      'SELECT key,title,active FROM situations WHERE library_scope!=?1 OR library_id!=?2',[scope.type,scope.id],
    ),
  ]);
  const byKey = new Map(records.map(record => [record.key,record]));
  const otherKeys = new Set(elsewhere.map(record => record.key));
  const otherNames = new Set(elsewhere.filter(record => record.active).map(record => record.title.trim().toLowerCase()));
  const rows = await Promise.all(bundle.situations.map(async (input: Situation) => {
    const fileKey = String(input?.key ?? '');
    let key = fileKey;
    const summary = (item: Situation, source: string) => ({
      key: String(item?.key ?? ''), title: String(item?.title ?? ''), source,
      staffLabel: String(item?.audience?.staffVariant ?? '').trim(),
      runnersOn: item?.runnersOn ?? null, outs: item?.outs ?? null,
    });
    const conflicts: ReturnType<typeof summary>[] = [];
    let incoming = summary(input, 'Import file');
    try {
      for (const item of bundle.situations) {
        if (item !== input && item?.key === fileKey) conflicts.push(summary(item, 'Import file'));
      }
      if (bundle.situations.filter((item: Situation) => item?.key === fileKey).length !== 1) throw new Error('Duplicate situation key in file.');

      if (!fileKey.trim()) throw new Error('A situation key is required.');
      if (scope.type !== 'global' && !byKey.has(fileKey)) key = await scopedImportKey(scope,fileKey);
      if (otherKeys.has(key)) throw new Error('This key belongs to a different library.');
      if (key !== fileKey && bundle.situations.some((item: Situation) => item?.key === key)) {
        throw new Error('This scoped copy collides with another key in the import file.');
      }
      const existing = byKey.get(key);
      const situation = editable(validateSituation(editable({ ...input, key, boardAnimation: input.boardAnimation === undefined ? existing?.boardAnimation : input.boardAnimation, suggestedDivisions: input.suggestedDivisions ?? existing?.suggestedDivisions, audience: input.audience ?? existing?.audience, variationTagged: existing?.variationTagged ?? input.variationTagged, variationNumber: existing?.variationNumber ?? input.variationNumber, variationTagVersion: existing?.variationTagVersion ?? input.variationTagVersion, variationSourceKey: input.variationSourceKey ?? existing?.variationSourceKey, ballLocation: input.ballLocation ?? existing?.ballLocation })));

      incoming = summary(situation, 'Import file');
      validateGeometry(situation);
      const current = existing;
      if (current?.active === false) throw new Error('This key belongs to an archived situation. Resolve it before importing.');
      const changes = fields.filter(field => field !== 'key' && stable(field === 'audience' ? current?.audience || {} : field === 'suggestedDivisions' ? current?.suggestedDivisions || [] : current?.[field]) !== stable(situation[field])).map(field => ({ field, before: current?.[field] ?? null, after: situation[field] ?? null }));
      const warning = !current && (otherKeys.has(fileKey) || otherNames.has(situation.title.trim().toLowerCase()))
        ? 'A matching situation exists in another library. This creates an independent copy that can appear alongside the inherited situation.'
        : undefined;
      return { key, title: situation.title, warning, status: current ? (changes.length ? 'changed' : 'unchanged') : 'new', revision: current?.revision, situation, changes };
    } catch (error) { return { key, title: String(input?.title ?? key), status: 'conflict', incoming, conflicts, error: error instanceof Error ? error.message : 'Invalid situation.' }; }
  }));
  return json({ source: String(bundle.source ?? 'Unknown environment'), destination: event.url.origin, destinationLibrary:scope.name, rows }, { headers: { 'Cache-Control': 'no-store' } });
};

export const PUT: RequestHandler = async event => {
  assertSameOrigin(event);
  const user = await requireUser(event,['admin']);
  const scope = await importDestination(event,user);
  if (!scope) return json({error:'Choose an existing Global, Organization, or Regional Library.'},{status:400});
  const db = databaseFor(event);
  const repository = new SqliteSituationRepository(db);
  try {
    const text = await event.request.text();
    if (text.length > 5_000_000) return json({error:'Situation must be smaller than 5 MB.'},{status:400});
    let input: Situation;
    try { input = JSON.parse(text); }
    catch { return json({error:'Choose a valid situation.'},{status:400}); }
    if (!input || typeof input !== 'object') return json({error:'Choose a valid situation.'},{status:400});
    // Older bundles omitted animation entirely. Preserve it rather than silently
    // deleting destination playback settings when publishing another field.
    const existing = typeof input.key === 'string' ? await repository.get(input.key) : null;
    const situation = validateSituation(editable({...input,boardAnimation:input.boardAnimation === undefined ? existing?.boardAnimation : input.boardAnimation}));
    validateGeometry(situation);
    const current = await db.one<{library_scope:string;library_id:string;active:number}>(
      'SELECT library_scope,library_id,active FROM situations WHERE key=?1',[situation.key],
    );
    const updating = event.request.headers.has('If-Match');
    if (current && (current.library_scope !== scope.type || current.library_id !== scope.id || !current.active) ||
        Boolean(current) !== updating) {
      return json({error:'The destination changed. Review the import again before publishing.'},{status:409});
    }
    const record = updating
      ? await repository.update(situation,expectedRevision(event.request),user.id,{scope})
      : await repository.create(situation,user.id,{scope});
    return json({record},{status:updating ? 200 : 201});
  } catch (error) { return repositoryErrorResponse(error); }
};
