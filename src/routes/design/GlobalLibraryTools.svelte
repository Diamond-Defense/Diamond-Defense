<script>
  import { onMount } from 'svelte';
  import { qualifiedSituationLabel } from '$lib/domain/situation-identity';
  import Button from '$lib/components/ui/Button.svelte';
  import Feedback from '$lib/components/ui/Feedback.svelte';
  let { request, refresh, mode, destination } = $props();
  let currentOrigin = $state('');
  function environmentName(origin) {
    try {
      const hostname = new URL(origin).hostname;
      if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return 'Local';
      if (hostname === 'preview.diamonddefence.app') return 'Preview';
      if (['diamonddefence.app', 'www.diamonddefence.app'].includes(hostname)) return 'Production';
      return hostname;
    } catch { return 'Unknown environment'; }
  }
  const destinationOrigin = $derived(review?.destination || currentOrigin);
  const destinationEnvironment = $derived(environmentName(destinationOrigin));
  let file = $state(null);
  let review = $state(null);
  let order = $state(null);
  let selected = $state([]);
  let previews = $state([]);
  let confirmText = $state('');
  let records = $state([]);
  let query = $state('');
  let difficulty = $state('');
  let filtersOpen = $state(false);
  let outs = $state('');
  let runners = $state('');
  let activity = $state('');
  const extraFilterCount = $derived([outs,runners,activity].filter(value=>value!=='').length);
  let category = $state('');
  let savedKeys = $state([]);
  let draggedKey = $state(null);
  let dropKey = $state(null);
  let announcement = $state('');
  const label = value => String(value || '').replace(/[_-]/g,' ').replace(/\b\w/g, c => c.toUpperCase());
  const transferLabel = item => {
    const situation = item.situation || item.incoming || item;
    return qualifiedSituationLabel({...situation, key: item.key, title: item.title, displayCode: item.displayCode || situation.displayCode});
  };
  const importFieldLabels = {
    title: 'Title', desc: 'Description', audience: 'Staff label', suggestedDivisions: 'Suggested age divisions',
    ballLocation: 'Ball location', category: 'Category', primaryCategory: 'Primary category', relatedCategories: 'Related categories',
    difficulty: 'Difficulty', outs: 'Starting outs', runnersOn: 'Starting runners', starts: 'Starting player positions',
    targets: 'Player target positions', hit: 'Ball destination', hitType: 'Batted ball type', boardAnimation: 'Animation',
    batterAdvance: 'Batter advancement', playOutcome: 'Play outcome', runnerOutcomes: 'Runner outcomes',
    playSeq: 'Primary throw sequence', playSeq2: 'Secondary throw sequence', seqNote: 'Throw sequence notes',
    variationNumber: 'Variation number', variationTagVersion: 'Variation label version', variationTagged: 'Variation labeling', variationSourceKey: 'Source situation'
  };
  const importFieldLabel = field => importFieldLabels[field] || label(String(field).replace(/([a-z])([A-Z])/g, '$1 $2'));
  const importChangeSummary = item => {
    if (item.status === 'new') return ['New situation will be added'];
    return (item.changes || []).map(change => `${importFieldLabel(change.field)} updated`);
  };
  const categoriesOf = item => [...new Set([item.primaryCategory, ...(item.relatedCategories || []), item.category].filter(Boolean))];
  const categories = $derived([...new Set(records.flatMap(categoriesOf))].sort());
  const dirty = $derived(Boolean(order && order.situations.map(item => item.key).join('|') !== savedKeys.join('|')));
  const publishable = $derived(review?.rows.filter(item => ['new','changed'].includes(item.status)) || []);
  const importCounts = $derived(review ? ['new','changed','unchanged','conflict'].map(value => ({value,count:review.rows.filter(item => item.status===value).length})) : []);

  let busy = $state(false);
  let status = $state('');
  let statusTone = $state('info');
  const matching = $derived(records.filter(item => `${item.title} ${item.displayCode || ''}`.toLowerCase().includes(query.trim().toLowerCase()) && (!difficulty || item.difficulty===difficulty) && (!category || categoriesOf(item).includes(category)) && (outs==='' || item.outs===Number(outs)) && (runners==='' || Object.values(item.runnersOn || {}).filter(Boolean).length===Number(runners)) && (!activity || item.active===(activity==='active'))));
  const blockers = $derived(previews.some(item => item.counts.blockingAssignments || item.counts.libraryReferences));
  const assignments = $derived([...new Map(previews.flatMap(item => item.blockingAssignments || []).map(item => [item.id,item])).values()]);

  async function run(operation) {
    if (busy) return;
    busy = true; status = ''; statusTone = 'info';
    try { await operation(); statusTone = 'success'; }
    catch (failure) { status = failure.message; statusTone = 'error'; }
    finally { busy = false; }
  }
  function load() {
    void run(async () => {
      if (mode === 'reorder') {order = await request('/api/admin/situations/order'); savedKeys = order.situations.map(item => item.key);}
      if (mode === 'delete' || mode === 'transfer') {
        const result = await request('/api/admin/situations');
        records = mode === 'transfer' ? result.situations.filter(item => item.active) : result.situations;
      }
    });
  }
  onMount(() => {currentOrigin = window.location.origin; load();});
  const json = (method, data) => ({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  function exportSelected() {
    return run(async () => {
      const bundle = await request('/api/admin/situations/transfer');
      const situations = bundle.situations.filter(item => selected.includes(item.key));
      if (!situations.length) throw new Error('Select current situations to export.');
      const url = URL.createObjectURL(new Blob([JSON.stringify({...bundle,situations},null,2)],{type:'application/json'}));
      const link = document.createElement('a'); link.href = url; link.download = 'diamond-defence-situations.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status = `Exported ${situations.length} situations.`;
    });
  }
  const importUrl = $derived('/api/admin/situations/transfer?' + new URLSearchParams({type:destination.type,id:destination.id}));
  function reviewImport() {
    return run(async () => {
      review = null;
      if (!file || file.size > 5_000_000) throw new Error('Choose a situation JSON file smaller than 5 MB.');
      review = await request(importUrl, {method:'POST',body:await file.text()});
      selected = [];
    });
  }
  function publishImport() {
    return run(async () => {
      const targetUrl = importUrl;
      const items = review.rows.filter(item => selected.includes(item.key) && ['new','changed'].includes(item.status));
      if (!items.length || !window.confirm(`Import ${items.length} situations into ${review.destinationLibrary} on ${environmentName(review.destination)} (${review.destination})?`)) return;
      const importedInto = `${review.destinationLibrary} on ${environmentName(review.destination)} (${review.destination})`;
      let count = 0;
      try {
        for (const item of items) {
          const options = json('PUT', item.situation);
          if (item.revision) options.headers['If-Match'] = String(item.revision);
          await request(targetUrl,options);
          count++;
        }
        review = null; selected = [];
        await refresh();
        status = `Imported ${count} situations into ${importedInto}.`;
      } catch (failure) {
        review = null; selected = [];
        if (count) await refresh();
        throw new Error(`${count} published before stopping. ${failure.message} Review the file again before retrying.`);
      }
    });
  }
  const permanentUrl = key => `/api/admin/situations/${encodeURIComponent(key)}/permanent`;
  function previewDelete() {
    return run(async () => {
      previews = []; confirmText = '';
      previews = await Promise.all(selected.map(key => request(permanentUrl(key))));
    });
  }
  function deleteSelected() {
    return run(async () => {
      if (!previews.length || blockers || confirmText !== 'DELETE') return;
      let count = 0;
      try {
        for (const item of previews) {
          const options = json('DELETE',{confirmation:item.title});
          options.headers['If-Match'] = String(item.revision);
          await request(permanentUrl(item.key),options);
          count++;
          selected = selected.filter(key => key !== item.key);
        }
        status = `Permanently deleted ${count} situations.`;
      } catch (failure) {
        status = `${count} deleted before stopping. ${failure.message} Review the remaining selection before retrying.`;
      } finally {
        previews = []; confirmText = '';
        if (count) {
          records = (await request('/api/admin/situations')).situations;
          await refresh();
        }
      }
    });
  }
  function archiveBlocking() {
    return run(async () => {
      if (!window.confirm(`Archive ${assignments.length} blocking assignments? Existing results will be kept.`)) return;
      for (const item of assignments) await request(`/api/practice/assignments/${encodeURIComponent(item.id)}`,json('PATCH',{action:'archive'}));
      previews = []; confirmText = ''; status = 'Assignments archived. Review deletion again.';
    });
  }
  function move(index, offset) {
    if (busy || index+offset < 0 || index+offset >= order.situations.length) return;
    const entries = [...order.situations];
    [entries[index],entries[index+offset]] = [entries[index+offset],entries[index]];
    order = {...order,situations:entries};
    announcement = `${entries[index+offset].title} moved to position ${index+offset+1}.`;
  }
  function resetOrder() {
    const byKey = new Map(order.situations.map(item => [item.key,item]));
    order = {...order,situations:savedKeys.map(key => byKey.get(key))};
    announcement = 'Order reset.';
  }
  function drop(event, key) {
    event.preventDefault();
    if (!busy && draggedKey && draggedKey!==key) {
      const entries = [...order.situations];
      const from = entries.findIndex(item => item.key===draggedKey);
      const to = entries.findIndex(item => item.key===key);
      const [item] = entries.splice(from,1);
      entries.splice(to,0,item);
      order = {...order,situations:entries};
      announcement = `${item.title} moved to position ${to+1}.`;
    }
    draggedKey=null; dropKey=null;
  }
  function guardNavigation(event) {
    if (!dirty) return;
    const control = event.target.closest('a,button');
    if (!control || control.closest('.global-tools')) return;
    if (!window.confirm('Discard unsaved library order changes?')) {event.preventDefault();event.stopImmediatePropagation();}
    else resetOrder();
  }
  function saveOrder() {
    return run(async () => {
      const result = await request('/api/admin/situations/order',json('PUT',{keys:order.situations.map(item => item.key),revision:order.revision}));
      order.revision = result.revision;
      savedKeys = order.situations.map(item => item.key);
      await refresh();
      status = 'Library order saved.';
    });
  }
</script>

<svelte:window onbeforeunload={event => {if(dirty){event.preventDefault();event.returnValue='';}}} />
<svelte:document onclickcapture={guardNavigation} />

{#snippet chevron(direction)}
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={direction==='up'?'m6 15 6-6 6 6':'m6 9 6 6 6-6'}/></svg>
{/snippet}
<section class="global-tools" aria-label={destination.type === 'global' ? 'Manage Global Library' : 'Import situations'}>
  <Feedback message={status} tone={statusTone} />
  {#if mode === 'import'}
    <p class="tool-purpose">Review a JSON file before adding or updating situations.</p>
    <div class="tool-upload">
      <div class="transfer-destination" aria-label="Import destination">
        <span class="muted">Import destination</span>
        <div class="transfer-destination-heading"><strong>{review?.destinationLibrary || destination.name}</strong><span class="environment-badge" class:production={destinationEnvironment === 'Production'}>{destinationEnvironment}</span></div>
        <span class="muted transfer-origin">{destinationOrigin || 'Loading environment…'}</span>
      </div>
      <label class="field">Situation JSON file <input type="file" accept=".json,application/json" disabled={busy}
        onchange={event => {file = event.currentTarget.files?.[0]; review = null; selected=[];}}></label>
      <p class="muted">JSON files up to 5 MB.{file ? ` Selected: ${file.name} (${Math.ceil(file.size/1024)} KB)` : ''}</p>
      <div class="tool-actions"><Button variant="primary" disabled={!file || busy} onclick={reviewImport}>Review</Button></div>
    </div>
    {#if review}
      <p class="transfer-origin">Source: <strong>{environmentName(review.source)}</strong> ({review.source})</p>
      <p>Importing into <strong>{review.destinationLibrary} · {destinationEnvironment}</strong> <span class="muted transfer-origin">({destinationOrigin})</span></p>
      <div class="tool-summary">{#each importCounts as count}<span><strong>{count.count}</strong> {count.value==='unchanged'?'Duplicates':count.value==='changed'?'Updates':count.value==='conflict'?'Conflicts / invalid': 'New'}</span>{/each}</div>
      <p class="muted">Duplicates are skipped. Conflicts and invalid entries cannot be selected. Review changed fields before importing updates.</p>
      <div class="tool-actions"><Button disabled={busy || !publishable.length} onclick={() => selected = publishable.map(item => item.key)}>Select eligible</Button><Button disabled={busy || !selected.length} onclick={() => selected=[]}>Clear</Button><span>{selected.length} selected</span><Button variant="primary" disabled={busy || !selected.length} onclick={publishImport}>Import into {destinationEnvironment} ({selected.length})</Button></div>
      <div class="admin-access-table-wrap"><table class="tool-table" aria-label="Import preview"><thead><tr><th class="tool-check">Select</th><th>Situation</th><th>Status</th><th>Review</th></tr></thead><tbody>
      {#each review.rows as item,index}
        <tr><td><input aria-label={'Select '+transferLabel(item)+' row '+(index+1)} type="checkbox" value={item.key} bind:group={selected} disabled={busy || !['new','changed'].includes(item.status)}></td><td>{transferLabel(item)}</td><td><span class="design-status" data-status={item.status==='conflict'?'rejected':item.status==='new'?'approved':'pending'}>{item.status==='unchanged'?'Duplicate':label(item.status)}</span></td><td>
          {#if item.error}<p class="tool-error">{item.error}</p>{/if}
          {#if item.warning}<p>{item.warning}</p>{/if}
          {#if item.status === 'new' || item.changes?.length}
            <ul class="import-change-summary">{#each importChangeSummary(item) as summary}<li>{summary}</li>{/each}</ul>
            {#if item.changes?.length}<details><summary>Technical details ({item.changes.length} fields)</summary>{#each item.changes as change}<pre>{importFieldLabel(change.field)} ({change.field}){'\n'}Current: {JSON.stringify(change.before,null,2)}{'\n'}Incoming: {JSON.stringify(change.after,null,2)}</pre>{/each}</details>{/if}
          {:else if !item.error && !item.warning}<span class="muted">No differences</span>{/if}
        </td></tr>
      {/each}
      </tbody></table></div>
    {/if}
  {:else if mode === 'reorder'}
    <div class="tool-actions"><p class="tool-purpose">Drag a handle to reorder, or use the up and down arrows.</p><span class="tool-order-state">{dirty?'Unsaved changes':'Order saved'}</span><Button disabled={busy || !dirty} onclick={resetOrder}>Reset</Button><Button variant="primary" disabled={busy || !dirty} onclick={saveOrder}>Save order</Button></div>
    <p class="sr-only" aria-live="polite">{announcement}</p>
    {#if order}
      <ol class="tool-order" aria-label="Library order">
        {#each order.situations as item,index (item.key)}
          <li class:drop-target={dropKey===item.key} class:dragging={draggedKey===item.key} ondragover={event=>{if(draggedKey && !busy){event.preventDefault();dropKey=item.key;event.dataTransfer.dropEffect='move';}}} ondrop={event=>drop(event,item.key)}>
            <button class="tool-drag" draggable={!busy} disabled={busy} aria-label={'Drag to reorder '+item.title} title="Drag to reorder" ondragstart={event=>{draggedKey=item.key;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.key);}} ondragend={()=>{draggedKey=null;dropKey=null;}}><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">{#each [5,12,19] as y}<circle cx="9" cy={y} r="1.5"/><circle cx="15" cy={y} r="1.5"/>{/each}</svg></button>
            <span class="tool-position">{index+1}</span><span class="tool-order-title">{item.title}</span>
            <div class="tool-arrows"><Button aria-label={'Move up: '+item.title} title="Move up" disabled={busy || index===0} onclick={()=>move(index,-1)}>{@render chevron('up')}</Button><Button aria-label={'Move down: '+item.title} title="Move down" disabled={busy || index===order.situations.length-1} onclick={()=>move(index,1)}>{@render chevron('down')}</Button></div>
          </li>
        {/each}
      </ol>
    {/if}
  {:else}
    <p class="tool-purpose">{mode==='transfer'?'Select situations to export as a JSON file.':'Permanently delete situations and their associated records. To retain history, use Remove from library in Situations instead.'}</p>
    <div class="toolbar workspace-toolbar tool-search-toolbar">
      <div class="filters">
        <label class="field">Search situations <input class="input" type="search" bind:value={query} disabled={busy}></label>
        <label class="field">Difficulty <select class="select" bind:value={difficulty} disabled={busy}><option value="">All difficulties</option>{#each ['foundational','intermediate','advanced'] as value}<option {value}>{label(value)}</option>{/each}</select></label>
        <label class="field">Category <select class="select" bind:value={category} disabled={busy}><option value="">All categories</option>{#each categories as value}<option {value}>{label(value)}</option>{/each}</select></label>
        <button class="design-filter-button" disabled={busy} aria-expanded={filtersOpen} aria-controls="manage-extra-filters" onclick={()=>filtersOpen=!filtersOpen}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6M15 14v6"/></svg>Filters{extraFilterCount ? ' · '+extraFilterCount+' active' : ''}</button>
        <button disabled={busy || !(query || difficulty || category || extraFilterCount)} onclick={()=>{query='';difficulty='';category='';outs='';runners='';activity='';}}>Clear filters</button>
      </div>
      <div class="design-extra-filters" id="manage-extra-filters" hidden={!filtersOpen}>
        <label class="field">Outs <select class="select" bind:value={outs} disabled={busy}><option value="">All outs</option>{#each [0,1,2] as value}<option value={String(value)}>{value} {value===1?'out':'outs'}</option>{/each}</select></label>
        <label class="field">Runners on base <select class="select" bind:value={runners} disabled={busy}><option value="">Any runners</option>{#each [0,1,2,3] as value}<option value={String(value)}>{value===0?'Bases empty':value===3?'Bases loaded':value+' '+(value===1?'runner':'runners')}</option>{/each}</select></label>
        {#if mode==='delete'}<label class="field">Status <select class="select" bind:value={activity} disabled={busy}><option value="">All statuses</option><option value="active">Active</option><option value="archived">Archived</option></select></label>{/if}
      </div>
    </div>
    <div class="tool-actions selection-toolbar">
      <span>{matching.length} {matching.length===1?'situation':'situations'}</span>
      <Button disabled={busy || !matching.length} onclick={()=>{selected=[...new Set([...selected,...matching.map(item=>item.key)])];previews=[];confirmText='';}}>Select matching ({matching.length})</Button>
      <span>{selected.length} selected</span>
      <Button disabled={busy || !selected.length} onclick={()=>{selected=[];previews=[];confirmText='';}}>Clear</Button>
      {#if mode==='transfer'}<Button variant="primary" disabled={busy || !selected.length} onclick={exportSelected}>Export ({selected.length})</Button>
      {:else}<Button disabled={busy || !selected.length} onclick={previewDelete}>Review deletion ({selected.length})</Button>{/if}
    </div>
    {#if previews.length}
      <section class="tool-deletion" aria-label="Deletion impact">
        <h3>Review permanent deletion</h3><p>This removes the selected situations and the associated records listed below. This cannot be undone.</p>
        <div class="admin-access-table-wrap"><table class="tool-table" aria-label="Deletion impact"><thead><tr><th>Situation</th><th>Attempts</th><th>Revisions</th><th>Proposals</th><th>Team selections</th><th>Inactive assignments</th></tr></thead><tbody>
        {#each previews as item}<tr><td>{item.title}{#if item.counts.libraryReferences}<p class="tool-error">Blocked: {item.counts.libraryReferences} library links, shares, or reviews. Remove from library instead to preserve these records.</p>{/if}</td><td>{item.counts.attempts}</td><td>{item.counts.revisions}</td><td>{item.counts.proposals}</td><td>{item.counts.teamPlaybooks}</td><td>{item.counts.inactiveAssignments}</td></tr>{/each}
        </tbody></table></div>
        {#if assignments.length}<p>Blocking assignments must be archived before deletion.</p><ul>{#each assignments as item}<li>{item.teamName} · {item.title}</li>{/each}</ul><div class="tool-actions"><Button disabled={busy} onclick={archiveBlocking}>Archive assignments</Button></div>{/if}
        <div class="tool-actions">
          <Button disabled={busy} onclick={()=>{previews=[];confirmText='';}}>Cancel</Button>
          {#if !blockers}<label class="field">Type DELETE to confirm<input bind:value={confirmText} disabled={busy}></label><Button variant="danger" class="tool-delete-primary" disabled={busy || confirmText!=='DELETE'} onclick={deleteSelected}>Delete ({previews.length})</Button>{/if}
        </div>
      </section>
    {/if}
    <div class="admin-access-table-wrap"><table class="tool-table" aria-label={mode==='transfer'?'Export situations':'Select situations for deletion'}><thead><tr><th class="tool-check"><input type="checkbox" aria-label="Select matching situations" disabled={busy || !matching.length} checked={matching.length>0 && matching.every(item=>selected.includes(item.key))} indeterminate={matching.some(item=>selected.includes(item.key)) && !matching.every(item=>selected.includes(item.key))} onchange={event=>{selected=event.currentTarget.checked?[...new Set([...selected,...matching.map(item=>item.key)])]:selected.filter(key=>!matching.some(item=>item.key===key));previews=[];confirmText='';}}></th><th>Situation</th><th>Difficulty</th><th>Category</th>{#if mode==='delete'}<th>Status</th>{/if}</tr></thead><tbody>
      {#each matching as item (item.key)}<tr class:selected-row={selected.includes(item.key)}><td><input aria-label={'Select '+(mode==='transfer'?transferLabel(item):item.title)} type="checkbox" bind:group={selected} value={item.key} disabled={busy} onchange={()=>{previews=[];confirmText='';}}></td><td>{mode==='transfer'?transferLabel(item):item.title}</td><td>{label(item.difficulty) || '—'}</td><td>{categoriesOf(item).map(label).join(', ') || '—'}</td>{#if mode==='delete'}<td>{item.active?'Active':'Archived'}</td>{/if}</tr>
      {:else}<tr><td colspan={mode==='delete'?5:4}>No situations match these filters.</td></tr>{/each}
    </tbody></table></div>
  {/if}
</section>

<style>
  .transfer-destination {display:grid;gap:6px;padding:14px;border:1px solid var(--border-emphasis);border-radius:8px;background:var(--surface-raised);}
  .transfer-destination-heading {display:flex;align-items:center;flex-wrap:wrap;gap:10px;}
  .environment-badge {display:inline-block;padding:4px 10px;border:1px solid var(--border-emphasis);border-radius:6px;font-weight:700;background:var(--surface);}
  .environment-badge.production {background:#fff3df;border-color:#b77919;color:#784600;}
  .transfer-origin {overflow-wrap:anywhere;}

  .import-change-summary { margin: 0 0 8px; padding-left: 18px; }
  .import-change-summary li + li { margin-top: 4px; }
  .global-tools {display:grid;gap:16px;min-width:0;padding:0;margin:0;background:transparent;border:0;box-shadow:none;}
  h3,p {margin:0;}
  .tool-purpose,.muted,.tool-order-state {color:var(--text-secondary);}
  .tool-actions {display:flex;align-items:center;flex-wrap:wrap;gap:12px;}
  .tool-actions .tool-purpose {flex:1;min-width:220px;}
  .tool-actions :global(button) {width:auto;flex:none;}
  .tool-search-toolbar {background:transparent;border:0;border-radius:0;padding:0;}
  .field {display:grid;gap:6px;margin:0;}
  .field input,.field select {width:100%;box-sizing:border-box;}
  .tool-check {width:44px;}
  .tool-table {width:100%;min-width:620px;border-collapse:collapse;background:var(--surface);}
  .tool-table thead {background:#29485f;color:white;}
  .tool-table th,.tool-table td {padding:12px;text-align:left;vertical-align:middle;}
  .tool-table td {border-bottom:1px solid var(--border);}
  .tool-table tr.selected-row td {background:var(--selection-background);}
  .tool-table tbody tr:hover td {background:var(--surface-hover);}
  input[type=checkbox] {width:18px;height:18px;margin:0;accent-color:var(--selection-border);}
  .tool-upload,.tool-deletion {display:grid;gap:16px;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-panel);}
  .tool-upload input[type=file] {padding:12px;border:1px dashed var(--border-emphasis);border-radius:8px;background:var(--surface-raised);}
  .tool-summary {display:flex;flex-wrap:wrap;gap:12px;}
  .tool-summary>span {padding:10px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;}
  .tool-error {color:var(--error);}
  .tool-order {padding:0;margin:0;list-style:none;border:1px solid var(--border);border-radius:var(--radius-panel);overflow:hidden;background:var(--surface);}
  .tool-order li {display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--border);}
  .tool-order li:last-child {border-bottom:0;}
  .tool-order li.drop-target {box-shadow:inset 0 3px var(--selection-border);background:var(--selection-background);}
  .tool-order li.dragging {opacity:.5;}
  .tool-drag {display:flex;align-items:center;justify-content:center;padding:6px;min-height:32px;border:0;background:transparent;color:var(--text-secondary);cursor:grab;}
  .tool-drag:active {cursor:grabbing;}
  .tool-position {width:2rem;color:var(--text-secondary);text-align:right;flex:none;}
  .tool-order-title {flex:1;min-width:0;overflow-wrap:anywhere;}
  .tool-arrows {display:flex;gap:6px;}
  .tool-arrows :global(button) {display:flex;align-items:center;justify-content:center;width:34px;min-height:34px;padding:6px;}
  :global(#designWorkspace .tool-delete-primary[data-variant=danger]) {background:var(--error);border-color:var(--error);color:white;}
  :global(#designWorkspace .tool-delete-primary[data-variant=danger]:hover:not(:disabled)) {background:var(--error);filter:brightness(.9);color:white;}
  pre {overflow:auto;max-height:15rem;white-space:pre-wrap;overflow-wrap:anywhere;}
  @media(max-width:600px) {.tool-upload,.tool-deletion {padding:12px;}}
</style>
