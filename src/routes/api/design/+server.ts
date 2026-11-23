import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Situation } from '$lib/domain/models';
import { databaseFor } from '$lib/server/database/context';
import type { SqlCommand } from '$lib/server/database/adapter';
import { writeAudit } from '$lib/server/repositories/audit';
import { repositoryErrorResponse } from '$lib/server/repositories/http-errors';
import { SqliteSituationRepository, validateSituation } from '$lib/server/repositories/situations';
import { assertSameOrigin, requireUser } from '$lib/server/security/authorization';
import { accessibleSituationRevision, designWorkspaces, parentLibrary, sameLibrary, type LibraryScope, type LibraryWorkspace } from '$lib/server/security/design-scopes';

interface LibraryEntry {
  key: string;
  revision: number;
  library_scope: LibraryScope['type'];
  library_id: string;
  lineage_key: string | null;
  source_situation_key: string | null;
  source_situation_revision: number | null;
  promotion_revision: number | null;
}

interface Promotion {
  id: string;
  source_key: string;
  source_revision: number;
  destination_scope: LibraryScope['type'];
  destination_id: string;
  submitted_by: string | null;
  review_notes: string;
  destination_key: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'kept';
}

function canReviewPublications(scope: LibraryWorkspace | undefined, isAdmin: boolean): boolean {
  return Boolean(scope && scope.type !== 'team' && (scope.canDesign || isAdmin));
}

function fail(message: string, status: number) {
  return json({ error: message }, { status });
}

function scopeOf(entry: LibraryEntry): LibraryScope {
  return { type: entry.library_scope, id: entry.library_id };
}

function destinationOf(request: Promotion): LibraryScope {
  return { type: request.destination_scope, id: request.destination_id };
}

function canCherryPickFrom(
  source: LibraryWorkspace | undefined,
  destination: LibraryScope,
  workspaces: LibraryWorkspace[],
): boolean {
  if (!source || source.type === 'global' || sameLibrary(source,destination)) return false;
  if (destination.type === 'global') return true;
  let ancestor = source.parent;
  while (ancestor) {
    if (sameLibrary(ancestor,destination)) return true;
    ancestor = workspaces.find(scope => sameLibrary(scope,ancestor!))?.parent;
  }
  return false;
}

function libraryPath(scope: LibraryWorkspace, workspaces: LibraryWorkspace[]): string {
  const parent = scope.parent && workspaces.find(item => sameLibrary(item,scope.parent!));
  return parent && parent.type !== 'global' ? libraryPath(parent,workspaces) + ' / ' + scope.name : scope.name;
}

export const GET: RequestHandler = async event => {
  const user = await requireUser(event, ['admin', 'coach']);
  const db = databaseFor(event);
  const workspaces = await designWorkspaces(db, user);
  if (!event.url.searchParams.has('type')) return json({ workspaces }, { headers: { 'Cache-Control': 'no-store' } });
  const selected = workspaces.find(scope => scope.type === event.url.searchParams.get('type')
    && scope.id === (event.url.searchParams.get('id') || ''));
  if (!selected) return fail('This library is outside your design workspace.', 403);
  const repository = new SqliteSituationRepository(db);
  const canReview = canReviewPublications(selected, user.role === 'admin');
  const sourceScopes = canReview ? workspaces.filter(scope => canCherryPickFrom(scope,selected,workspaces)) : [];
  const [entries, inherited, candidateRows, incoming, outgoing, difficultyRule] = await Promise.all([
    repository.listOwnedCatalog(selected),
    selected.type === 'global' ? [] : repository.listInherited(selected),
    sourceScopes.length ? db.all<{key:string;title:string;revision:number;library_scope:LibraryScope['type'];library_id:string}>(
      `SELECT s.key,s.title,s.revision,s.library_scope,s.library_id
        FROM json_each(?3) scope
        JOIN situations s ON s.library_scope=json_extract(scope.value,'$.type')
          AND s.library_id=json_extract(scope.value,'$.id') AND s.active=1
        JOIN library_owned_catalog owned ON owned.key=s.key
        WHERE NOT EXISTS (
          SELECT 1 FROM situation_promotions p WHERE p.source_key=s.key AND p.source_revision=s.revision
            AND p.destination_scope=?1 AND p.destination_id=?2
        )
        ORDER BY s.library_order,s.display_code,s.key`,
      [selected.type,selected.id,JSON.stringify(sourceScopes.map(({type,id}) => ({type,id})))],
    ) : [],
    canReview ? db.all<Promotion>(
      "SELECT * FROM situation_promotions WHERE destination_scope=?1 AND destination_id=?2 AND status='pending' ORDER BY created_at",
      [selected.type, selected.id]) : [],
    db.all<Promotion & { destination_name: string; source_title: string }>(`SELECT p.*,
      COALESCE(r.name,o.name,'Global Library') AS destination_name, s.title AS source_title
      FROM situation_promotions p JOIN situations s ON s.key=p.source_key
      LEFT JOIN regions r ON p.destination_scope='region' AND r.id=p.destination_id
      LEFT JOIN organizations o ON p.destination_scope='organization' AND o.id=p.destination_id
      WHERE s.library_scope=?1 AND s.library_id=?2 ORDER BY p.created_at DESC`, [selected.type, selected.id]),
    selected.type === 'team' ? db.one<{ maximum: string }>(
      'SELECT maximum FROM team_global_difficulty WHERE team_id=?1', [selected.id],
    ) : null,
  ]);
  const candidates = sourceScopes.map(scope => ({
    scope, path:libraryPath(scope,workspaces),
    entries:candidateRows.filter(entry => entry.library_scope === scope.type && entry.library_id === scope.id)
      .map(({key,title,revision}) => ({key,title,revision})),
  })).filter(group => group.entries.length);

  const reviews = await Promise.all(incoming.map(async promotion => {
    const [source, snapshot] = await Promise.all([
      db.one<LibraryEntry>('SELECT * FROM situations WHERE key=?1 AND active=1', [promotion.source_key]),
      db.one<{ payload_json: string }>(
        'SELECT payload_json FROM situation_versions WHERE situation_key=?1 AND revision=?2',
        [promotion.source_key, promotion.source_revision],
      ),
    ]);
    const destination = source && await db.one<LibraryEntry>(
      'SELECT * FROM situations WHERE library_scope=?1 AND library_id=?2 AND lineage_key=?3 AND active=1',
      [selected.type, selected.id, source.lineage_key || source.key],
    );
    const parent = source && await parentLibrary(db, scopeOf(source));
    const sourceWorkspace = source && workspaces.find(scope => sameLibrary(scope,scopeOf(source)));
    const canResolve = promotion.submitted_by
      ? Boolean(parent && sameLibrary(parent,selected))
      : canCherryPickFrom(sourceWorkspace || undefined,selected,workspaces);
    return {
      ...promotion,
      sourceLibraryName: sourceWorkspace ? libraryPath(sourceWorkspace,workspaces) : null,
      sourceTitle: snapshot ? (JSON.parse(snapshot.payload_json) as Situation).title : promotion.source_key,
      stale: source?.revision !== promotion.source_revision || !canResolve,
      existing: destination ? await repository.get(destination.key) : null,
      incoming: snapshot ? JSON.parse(snapshot.payload_json) as Situation : null,
    };
  }));
  const ownKeys = entries.map(entry => entry.key);
  const changes = await db.all<{ id: string; sourceKey: string; revision: number; payload_json: string; original_json: string; status: string; stale: number; is_owned: number; author_id: string; destination_scope: string; destination_id: string }>(
      `SELECT p.id,p.author_id,s.library_scope AS destination_scope,s.library_id AS destination_id,p.source_key AS sourceKey,p.source_revision AS revision,p.payload_json,
        v.payload_json AS original_json,p.status,(s.revision<>p.source_revision OR s.active<>1) AS stale,
        (s.library_scope=?2 AND s.library_id=?3) AS is_owned
        FROM situation_change_proposals p JOIN situations s ON s.key=p.source_key
        JOIN situation_versions v ON v.situation_key=p.source_key AND v.revision=p.source_revision
        WHERE (p.author_id=?1 AND p.author_scope=?2 AND p.author_scope_id=?3)
          OR (?4=1 AND s.library_scope=?2 AND s.library_id=?3)
        ORDER BY p.created_at DESC`, [user.id, selected.type, selected.id, Number(selected.canDesign)]);
  const changeReviews = changes.map(({payload_json,original_json,is_owned,author_id,...item}) => ({
    ...item, submittedByYou:author_id === user.id,
    destinationName:workspaces.find(scope => scope.type===item.destination_scope && scope.id===item.destination_id)?.name,
    proposed:JSON.parse(payload_json), original:JSON.parse(original_json),
    canReview: selected.canDesign && Boolean(is_owned),
  }));
  return json({ selected, entries, ownKeys, sourceEntries: candidates, incoming: reviews,
    outgoing:outgoing.map(item => ({...item,canWithdraw:item.status === 'pending' && item.submitted_by === user.id})),
    canReview, canCherryPick:sourceScopes.length > 0, changeReviews, inherited, maximumDifficulty: difficultyRule?.maximum || 'all',
  }, { headers: { 'Cache-Control': 'no-store' } });
};

export const POST: RequestHandler = async event => {
  assertSameOrigin(event);
  const user = await requireUser(event, ['admin', 'coach']);
  const db = databaseFor(event);
  const body = await event.request.json();
  const workspaces = await designWorkspaces(db, user);
  const find = (type: unknown, id: unknown) => workspaces.find(scope => scope.type === type && scope.id === id);
  const repository = new SqliteSituationRepository(db);

  try {
    if (body?.action === 'preview_candidate') {
      const target = find(body.type,body.id);
      const entry = await db.one<LibraryEntry>('SELECT * FROM situations WHERE key=?1 AND active=1',[String(body.sourceKey || '')]);
      const sourceWorkspace = entry && find(entry.library_scope,entry.library_id);
      if (!target || !canReviewPublications(target,user.role === 'admin') ||
          !canCherryPickFrom(sourceWorkspace || undefined,target,workspaces)) {
        return fail('This situation is outside the destination library’s scope.',403);
      }
      const snapshot = entry && await repository.get(entry.key);
      if (!snapshot || snapshot.revision !== body.sourceRevision) return fail('The source changed. Reload before play-testing.',409);
      return json({snapshot});
    }
    if (body?.action === 'withdraw_submission') {
      const id = String(body.promotionId || '');
      // Audit and remove only the submitter's pending request in the same transaction.
      const [result] = await db.batch([
        {sql:`INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,before_json,created_at)
          SELECT ?1,?2,'withdraw','situation_promotion',id,
            json_object('sourceKey',source_key,'revision',source_revision,'destinationType',destination_scope,'destinationId',destination_id),?4
          FROM situation_promotions WHERE id=?3 AND submitted_by=?2 AND status='pending'`,
          params:[crypto.randomUUID(),user.id,id,new Date().toISOString()]},
        {sql:"DELETE FROM situation_promotions WHERE id=?1 AND submitted_by=?2 AND status='pending'",
          params:[id,user.id]},
      ]);
      if (!result.changes) return fail('Only the submitter can withdraw a pending submission.',409);
      return json({ok:true});
    }
    if (['inherited_visibility','inherited_difficulty','global_visibility','global_difficulty'].includes(body?.action)) {
      const scope = find(body.type, body.id);
      if (!scope || scope.type === 'global') return fail('Choose a library you manage.', 403);
      if (['inherited_difficulty','global_difficulty'].includes(body.action)) {
        if (scope.type !== 'team') return fail('Choose a team.', 400);
        if (!['all', 'foundational', 'intermediate'].includes(body.maximum)) return fail('Choose a difficulty range.', 400);
        if (body.maximum === 'all') {
          await db.execute('DELETE FROM team_global_difficulty WHERE team_id=?1', [scope.id]);
        } else {
          await db.execute(`INSERT INTO team_global_difficulty(team_id,maximum) VALUES(?1,?2)
            ON CONFLICT(team_id) DO UPDATE SET maximum=excluded.maximum`, [scope.id, body.maximum]);
        }
        await writeAudit(db,user.id,'visibility','team-playbook',scope.id,null,{ maximum:body.maximum });
        return json({ok:true});
      }
      const keys = body.keys;
      if (typeof body.hidden !== 'boolean' || !Array.isArray(keys) || !keys.length || keys.length > 5000 ||
        keys.some(key => typeof key !== 'string')) return fail('Choose inherited situations.', 400);
      const params = [scope.type, scope.id, JSON.stringify(keys)];
      if (body.hidden) {
        await db.execute(`INSERT OR IGNORE INTO global_situation_hides(scope_type,scope_id,situation_key)
          SELECT scope_type,scope_id,situation_key FROM library_inheritance WHERE scope_type=?1 AND scope_id=?2
            AND situation_key IN (SELECT value FROM json_each(?3))`, params);
      } else {
        await db.execute(`DELETE FROM global_situation_hides WHERE scope_type=?1 AND scope_id=?2
          AND situation_key IN (
            SELECT old.key FROM situations old JOIN library_inheritance i
              ON i.lineage=COALESCE(old.lineage_key,old.key)
            WHERE i.scope_type=?1 AND i.scope_id=?2 AND i.situation_key IN (SELECT value FROM json_each(?3))
          )`, params);
      }
      await writeAudit(db,user.id,'visibility','situation_library',scope.id,null,{ scope, keys, hidden:body.hidden });
      return json({ok:true});
    }
    if (['link','link_selected','unlink','distribute','adopt','adopt_all','remove_adoption'].includes(body?.action)) {
      return fail('Libraries inherit situations automatically. Use Hide and Show in Design to manage availability.',410);
    }
    if (body?.action === 'change_proposal' || body?.action === 'create_variation') {
      const scope = find(body.type, body.id);
      if (!scope?.canDesign) return fail('Designer access is required.',403);
      const key = body.sourceKey;
      const revision = body.sourceRevision;
      if (typeof key !== 'string' || !Number.isInteger(revision)) return fail('Choose a source revision.',400);
      const original = await accessibleSituationRevision(db,scope,key,revision);
      if (!original) return fail('This revision is outside your library access.',403);
      const situation = validateSituation({...body.situation,key});
      if (body.action === 'change_proposal') {
        if (original.current_revision !== revision) return fail('Open the latest revision before proposing an update.', 409);
        const id = crypto.randomUUID();
        await db.execute(`INSERT INTO situation_change_proposals(id,source_key,source_revision,author_id,payload_json,author_scope,author_scope_id)
          VALUES (?1,?2,?3,?4,?5,?6,?7)`, [id,key,revision,user.id,JSON.stringify(situation),scope.type,scope.id]);
        await writeAudit(db,user.id,'propose_update','situation',key,null,{id,revision});
        return json({id}, {status:201});
      }
      const title = String(situation.title || '').trim();
      if (!title || title.toLowerCase() === String(JSON.parse(original.payload_json).title).trim().toLowerCase()) {
        return fail('Give the variation its own name.',400);
      }
      delete situation.displayCode;
      delete situation.variationNumber;
      const record = await repository.create({...situation,key:`variation-${crypto.randomUUID()}`,variationSourceKey:key,variationTagged:true},
        user.id,{scope, variationSource:{key,revision}});
      return json({record}, {status:201});
    }
    if (body?.action === 'review_change') {
      const proposal = await db.one<{source_key:string;source_revision:number;payload_json:string;status:string}>(`
        SELECT * FROM situation_change_proposals WHERE id=?1`,[String(body.proposalId || '')]);
      if (!proposal || proposal.status !== 'pending') return fail('This proposal is no longer pending.',409);
      const entry = await db.one<LibraryEntry>('SELECT * FROM situations WHERE key=?1 AND active=1',[proposal.source_key]);
      if (!entry || !find(entry.library_scope, entry.library_id)?.canDesign) return fail('Designer access is required in the owning library.',403);
      const approval = body.resolution === 'approve';
      if (!approval && body.resolution !== 'reject') return fail('Choose approve or reject.',400);
      if (approval && entry.revision !== proposal.source_revision) return fail('The original changed. A new draft is needed.',409);
      if (approval) await repository.update(JSON.parse(proposal.payload_json),proposal.source_revision,user.id,{
        scope:scopeOf(entry),changeProposalId:body.proposalId,
        completion:(key,revision) => [{sql:`UPDATE situation_change_proposals SET status='approved',reviewed_by=?2
          WHERE id=?1 AND status='pending' AND changes()>0 AND EXISTS (SELECT 1 FROM situations WHERE key=?3 AND revision=?4)`,
          params:[body.proposalId,user.id,key,revision]}],
      });
      else await db.execute("UPDATE situation_change_proposals SET status='rejected',reviewed_by=?2 WHERE id=?1 AND status='pending'",
        [body.proposalId,user.id]);
      await writeAudit(db,user.id,approval ? 'approve_update' : 'reject_update','situation',entry.key,null,{proposalId:body.proposalId});
      return json({ok:true});
    }
    if (body?.action === 'publish') {
      const scope = find(body.type, body.id);
      if (!scope?.canDesign) return fail('Designer access is required for this library.', 403);
      const situation = body.situation as Situation;
      if (!situation?.key) return fail('A situation is required.', 400);
      const current = await db.one<LibraryEntry>('SELECT * FROM situations WHERE key=?1 AND active=1', [situation.key]);
      if (current && !sameLibrary(scopeOf(current), scope)) return fail('This situation belongs to another library.', 403);
      if (current && !Number.isInteger(body.revision)) return fail('Provide the revision being edited.', 428);
      const record = current
        ? await repository.update(situation, body.revision, user.id)
        : await repository.create(situation, user.id, { scope });
      return json({ record }, { status: current ? 200 : 201 });
    }

    if (body?.action === 'archive') {
      const scope = find(body.type, body.id);
      if (!scope?.canDesign) return fail('Designer access is required for this library.', 403);
      const entry = await db.one<LibraryEntry>(
        'SELECT * FROM situations WHERE key=?1 AND library_scope=?2 AND library_id=?3 AND active=1', [body.sourceKey, scope.type, scope.id],
      );
      if (!entry) return fail('Situation not found in this library.', 404);
      if (entry.revision !== body.sourceRevision) return fail('The situation was updated. Reload and try again.', 409);
      const activePractice = await db.one(
        `SELECT pa.id FROM assignment_situations a JOIN practice_assignments pa ON pa.id=a.assignment_id
          WHERE a.situation_key=?1 AND pa.status='active' LIMIT 1`, [entry.key],
      );
      if (activePractice) return fail('Close active practice assignments using this situation before archiving it.', 409);
      const record = await repository.setActive(entry.key, false, entry.revision, user.id);
      return json({ record });
    }

    const pending = typeof body?.promotionId === 'string'
      ? await db.one<Promotion>('SELECT * FROM situation_promotions WHERE id=?1', [body.promotionId]) : null;
    if (body?.action === 'reject' && pending) {
      const destination = destinationOf(pending);
      const reviewer = find(destination.type, destination.id);
      if (!canReviewPublications(reviewer,user.role === 'admin')) {
        return fail('Designer access is required for the destination library.', 403);
      }
      if (body.explanation != null && (typeof body.explanation !== 'string' || body.explanation.length > 2000)) {
        return fail('Explanation must be text with at most 2,000 characters.', 400);
      }
      const explanation = (body.explanation || '').trim();
      const now = new Date().toISOString();
      const result = await db.execute(`UPDATE situation_promotions SET status='rejected', reviewed_by=?2,
        reviewed_at=?3, review_notes=?4 WHERE id=?1 AND status='pending'`, [pending.id, user.id, now, explanation]);
      if (result.changes) await writeAudit(db, user.id, 'reject', 'situation_promotion', pending.id, null,
        { sourceKey: pending.source_key, revision: pending.source_revision, destination,
          approvalType: user.role === 'admin' && destination.type !== 'global' ? 'admin_override' : 'submission_review' });
      return json({ ok: true });
    }

    const key = pending?.source_key || body?.sourceKey;
    const revision = pending?.source_revision || body?.sourceRevision;
    if (typeof key !== 'string' || !Number.isInteger(revision) || revision < 1) {
      return fail('Choose a source situation revision.', 400);
    }
    const source = await db.one<LibraryEntry>('SELECT * FROM situations WHERE key=?1 AND active=1', [key]);
    if (!source) return fail('The source situation is no longer available.', 409);
    const sourceScope = scopeOf(source);
    const sourceWorkspace = find(sourceScope.type, sourceScope.id);

    const parent = await parentLibrary(db, sourceScope);
    const cherryPick = body.action === 'cherry_pick' || (body.action === 'approve' && pending && !pending.submitted_by);
    const target = body.action === 'cherry_pick' ? find(body.type,body.id)
      : pending ? find(pending.destination_scope,pending.destination_id)
      : parent ? find(parent.type,parent.id) : undefined;

    if (body.action === 'submit') {
      if (!sourceWorkspace?.canDesign) return fail('Designer access is required for the source library.', 403);
      if (!parent) return fail('This library has no parent to receive a submission.', 409);
    } else if (body.action === 'approve' || body.action === 'cherry_pick') {
      if (!target || !canReviewPublications(target,user.role === 'admin')) {
        return fail('Designer access is required for the destination library.', 403);
      }
      if (cherryPick) {
        if (!canCherryPickFrom(sourceWorkspace,target,workspaces)) {
          return fail('The source is outside the destination library’s scope.',403);
        }
      } else if (!parent || !sameLibrary(target,parent)) {
        return fail('The source moved to another scope. Submit it to the new parent.',409);
      }
      if (body.action === 'approve' && target.type === 'global' && !pending) {
        return fail('Choose a submitted request before reviewing it.', 400);
      }
    } else return fail('Choose a design action.', 400);

    const destination = (body.action === 'submit' ? parent : target)!;
    let promotion = pending || await db.one<Promotion>(`SELECT * FROM situation_promotions
      WHERE source_key=?1 AND source_revision=?2 AND destination_scope=?3 AND destination_id=?4`,
      [key, revision, destination.type, destination.id]);
    if (body.action === 'submit' && promotion?.status === 'rejected') {
      if (source.revision !== revision) {
        return fail('The source has changed. Refresh before resubmitting it.', 409);
      }
      const now = new Date().toISOString();
      const result = await db.execute(`UPDATE situation_promotions SET status='pending', submitted_by=?2,
        created_at=?3, reviewed_by=NULL, reviewed_at=NULL, review_notes=''
        WHERE id=?1 AND status='rejected'`, [promotion.id, user.id, now]);
      if (result.changes) {
        await writeAudit(db, user.id, 'resubmit_promotion', 'situation_promotion', promotion.id, null,
          { source: sourceScope, destination, revision, previousReviewNotes: promotion.review_notes });
      }
      promotion = await db.one<Promotion>('SELECT * FROM situation_promotions WHERE id=?1', [promotion.id]);
      return json({ promotion });
    }
    if (promotion && promotion.status !== 'pending') {
      return json({ promotion });
    }
    if (source.revision !== revision) {
      return fail('The source has changed. Review the latest revision before submitting or approving it.', 409);
    }
    if (!promotion) {
      const created = await db.execute(`INSERT OR IGNORE INTO situation_promotions
        (id,source_key,source_revision,destination_scope,destination_id,submitted_by,created_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7)`,
      [crypto.randomUUID(), key, revision, destination.type, destination.id, body.action === 'submit' ? user.id : null, new Date().toISOString()]);
      if (created.changes && body.action === 'submit') {
        await writeAudit(db, user.id, 'submit_promotion', 'situation', key, null, { source: sourceScope, destination, revision });
      }
      promotion = await db.one<Promotion>(`SELECT * FROM situation_promotions
        WHERE source_key=?1 AND source_revision=?2 AND destination_scope=?3 AND destination_id=?4`, [key, revision, destination.type, destination.id]);
    }
    if (body.action === 'cherry_pick' && promotion?.submitted_by && promotion.status === 'pending') {
      return fail('This revision is already waiting in Publication reviews.',409);
    }
    if (!promotion || body.action === 'submit' || promotion.status !== 'pending') return json({ promotion });

    const existing = await db.one<LibraryEntry>(`SELECT * FROM situations
      WHERE library_scope=?1 AND library_id=?2 AND lineage_key=?3 AND active=1`,
      [destination.type, destination.id, source.lineage_key || key]);
    const approvalType = !promotion.submitted_by ? 'cherry_pick'
      : user.role === 'admin' && destination.type !== 'global' ? 'admin_override'
      : destination.type === 'region' && user.coachedTeamIds?.includes(sourceScope.id) ? 'regional_self_approval'
      : pending ? 'submission_review' : 'cherry_pick';
    const now = new Date().toISOString();

    if (existing && body.destinationRevision !== existing.revision && body.resolution) {
      return fail('The destination changed. Review both versions again.', 409);
    }
    if (existing && body.resolution === 'keep') {
      const result = await db.execute(`UPDATE situation_promotions SET status='kept', reviewed_by=?2,
        reviewed_at=?3, destination_key=?4 WHERE id=?1 AND status='pending'
        AND EXISTS (SELECT 1 FROM situations WHERE key=?4 AND revision=?5 AND active=1)`,
      [promotion.id, user.id, now, existing.key, existing.revision]);
      if (!result.changes) return fail('The review or destination changed. Reload the library.', 409);
      await writeAudit(db, user.id, 'keep', 'situation_promotion', promotion.id, null,
        { source: sourceScope, destination, revision, approvalType });
      return json({ ok: true });
    }
    if (existing && !['adopt', 'variation'].includes(body.resolution)) {
      return fail('Review update and choose whether to keep, adopt, or create a variation.', 409);
    }
    const snapshot = await repository.get(key);
    if (!snapshot || snapshot.revision !== revision) return fail('Review the latest source revision before approving.', 409);
    const createVariation = body.resolution === 'variation';
    const title = createVariation ? String(body.title || '').trim() : snapshot.title;
    if (!title) return fail('Enter a name for the variation.', 400);
    const draft = { ...snapshot, key: existing && !createVariation ? existing.key : `promoted-${promotion.id}`, title,
      ...(createVariation ? { variationSourceKey: existing?.key || key, variationTagged: true } : {}) };
    const audit = { source: sourceScope, destination, revision, approvalType, sourceKey: key };
    const promotionId = promotion.id;
    const publication = {
      scope: destination,
      lineage: createVariation ? draft.key : source.lineage_key || key,
      source: { key, revision },
      promotionId,
      completion: (destinationKey: string, destinationRevision: number): SqlCommand[] => [
        {
          sql: `UPDATE situation_promotions SET status='approved',reviewed_by=?2,reviewed_at=?3,destination_key=?4
                WHERE id=?1 AND status='pending' AND EXISTS (
                  SELECT 1 FROM situations WHERE key=?4 AND revision=?5 AND source_situation_key=?6 AND source_situation_revision=?7
                )`,
          params: [promotionId, user.id, now, destinationKey, destinationRevision, key, revision],
        },
        {
          sql: `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,after_json,created_at)
                SELECT ?1,?2,'approve','situation_promotion',?3,?4,?5
                FROM situation_promotions WHERE id=?3 AND status='approved' AND reviewed_by=?2 AND reviewed_at=?5`,
          params: [crypto.randomUUID(), user.id, promotionId, JSON.stringify({ ...audit, destinationKey, destinationRevision }), now],
        },
      ],
    };
    try {
      const record = existing && !createVariation
        ? await repository.update(draft, existing.revision, user.id, publication)
        : await repository.create(draft, user.id, publication);
      return json({ record });
    } catch (error) {
      const completed = await db.one<Promotion>('SELECT * FROM situation_promotions WHERE id=?1 AND status=?2', [promotionId, 'approved']);
      if (completed) return json({ promotion: completed });
      throw error;
    }
  } catch (error) {
    return repositoryErrorResponse(error);
  }
};
