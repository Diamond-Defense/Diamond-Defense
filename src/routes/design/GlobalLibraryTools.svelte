<script>
  import { onMount } from 'svelte';
  let { request, refresh, mode } = $props();
  let file = $state(null);
  let review = $state(null);
  let order = $state(null);
  let selected = $state([]);
  let previews = $state([]);
  let confirmText = $state('');
  let records = $state([]);
  let query = $state('');
  let busy = $state(false);
  let status = $state('');
  const matching = $derived(records.filter(item => `${item.title} ${item.displayCode || ''}`.toLowerCase().includes(query.trim().toLowerCase())));
  const blockers = $derived(previews.some(item => item.counts.blockingAssignments || item.counts.libraryReferences));
  const assignments = $derived([...new Map(previews.flatMap(item => item.blockingAssignments || []).map(item => [item.id,item])).values()]);

  async function run(operation) {
    if (busy) return;
    busy = true; status = '';
    try { await operation(); }
    catch (failure) { status = failure.message; }
    finally { busy = false; }
  }
  function load() {
    void run(async () => {
      if (mode === 'reorder') order = await request('/api/admin/situations/order');
      if (mode === 'delete' || mode === 'transfer') {
        const result = await request('/api/admin/situations');
        records = mode === 'transfer' ? result.situations.filter(item => item.active) : result.situations;
      }
    });
  }
  onMount(load);
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
  function reviewImport() {
    return run(async () => {
      review = null;
      if (!file || file.size > 5_000_000) throw new Error('Choose a situation JSON file smaller than 5 MB.');
      review = await request('/api/admin/situations/transfer', {method:'POST',body:await file.text()});
      selected = [];
    });
  }
  function publishImport() {
    return run(async () => {
      const items = review.rows.filter(item => selected.includes(item.key) && ['new','changed'].includes(item.status));
      if (!items.length || !window.confirm(`Publish ${items.length} situations to ${review.destination}?`)) return;
      let count = 0;
      try {
        for (const item of items) {
          const options = json(item.status === 'new' ? 'POST' : 'PUT', item.situation);
          if (item.revision) options.headers['If-Match'] = String(item.revision);
          await request(item.status === 'new' ? '/api/situations' : `/api/situations/${encodeURIComponent(item.key)}`,options);
          count++;
        }
        review = null; selected = [];
        await refresh();
        status = `Published ${count} situations.`;
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
    const entries = [...order.situations];
    [entries[index],entries[index+offset]] = [entries[index+offset],entries[index]];
    order = {...order,situations:entries};
  }
  function saveOrder() {
    return run(async () => {
      const result = await request('/api/admin/situations/order',json('PUT',{keys:order.situations.map(item => item.key),revision:order.revision}));
      order.revision = result.revision;
      await refresh();
      status = 'Library order saved.';
    });
  }
</script>

<section class="card global-tools" aria-label="Manage Global Library">
  <h2>{mode === 'transfer' ? 'Export situations' : mode === 'import' ? 'Import situations' : mode === 'reorder' ? 'Library order' : 'Delete situations'}</h2>
  {#if status}<p role="status">{status}</p>{/if}
  {#if mode === 'import'}
    <label class="field">Situation JSON file <input type="file" accept=".json,application/json" disabled={busy}
      onchange={event => {file = event.currentTarget.files?.[0]; review = null;}}></label>
    <button class="btn btn-ghost" disabled={!file || busy} onclick={reviewImport}>Review import</button>
    {#if review}
      <p>Import from {review.source} into {review.destination}.</p>
      <div class="admin-actions">
        <button class="btn btn-ghost" disabled={busy} onclick={() => selected = review.rows.filter(item => ['new','changed'].includes(item.status)).map(item => item.key)}>Select all publishable</button>
        <button class="btn btn-brand" disabled={busy || !selected.length} onclick={publishImport}>Publish selected ({selected.length})</button>
      </div>
      {#each review.rows as item}
        <div class="tool-row">
          <label><input type="checkbox" value={item.key} bind:group={selected} disabled={busy || !['new','changed'].includes(item.status)}>
            {item.title || item.key} · {item.status}</label>
          {#if item.error}<p>{item.error}</p>{/if}
          {#if item.changes?.length}
            <details><summary>Review changed fields</summary>
              {#each item.changes as change}<pre>{change.field}{'\n'}Current: {JSON.stringify(change.before,null,2)}{'\n'}Incoming: {JSON.stringify(change.after,null,2)}</pre>{/each}
            </details>
          {/if}
        </div>
      {/each}
    {/if}
  {:else if mode === 'reorder'}
    {#if order}
      <button class="btn btn-brand" disabled={busy} onclick={saveOrder}>Save order</button>
      <ol>
        {#each order.situations as item,index (item.key)}
          <li class="tool-row">{item.title}
            <button class="btn btn-ghost" aria-label={'Move up: ' + item.title} disabled={busy || index === 0} onclick={() => move(index,-1)}>Move up</button>
            <button class="btn btn-ghost" aria-label={'Move down: ' + item.title} disabled={busy || index === order.situations.length - 1} onclick={() => move(index,1)}>Move down</button>
          </li>
        {/each}
      </ol>
    {/if}
  {:else}
    <label class="field">Search situations <input type="search" bind:value={query} disabled={busy}></label>
    <div class="admin-actions">
      <button class="btn btn-ghost" disabled={busy || !matching.length} onclick={() => {selected = matching.map(item => item.key); previews = [];}}>Select matching</button>
      <button class="btn btn-ghost" disabled={busy || !selected.length} onclick={() => {selected = []; previews = [];}}>Clear selection</button>
      {#if mode === 'transfer'}
        <button class="btn btn-brand" disabled={busy || !selected.length} onclick={exportSelected}>Download selected ({selected.length})</button>
      {:else}
        <button class="btn btn-danger" disabled={busy || !selected.length} onclick={previewDelete}>Review deletion ({selected.length})</button>
      {/if}
    </div>
    {#if previews.length}
      <section aria-label="Deletion impact">
        <h3>Permanent deletion impact</h3>
        {#each previews as item}
          <p>{item.title} · {item.counts.attempts} attempts · {item.counts.revisions} revisions · {item.counts.proposals} proposals ·
            {item.counts.teamPlaybooks} team Playbook selections · {item.counts.inactiveAssignments} inactive assignments</p>
          {#if item.counts.libraryReferences}<p>{item.counts.libraryReferences} library links, shares, or reviews reference this situation. Archive it from the library to preserve those records.</p>{/if}
        {/each}
        {#if assignments.length}
          <p>Blocking assignments must be archived before deletion.</p>
          <ul>{#each assignments as item}<li>{item.teamName} · {item.title}</li>{/each}</ul>
          <button class="btn btn-ghost" disabled={busy} onclick={archiveBlocking}>Archive blocking assignments</button>
        {/if}
        {#if !blockers}
          <label class="field">Type DELETE to confirm <input bind:value={confirmText} disabled={busy}></label>
          <button class="btn btn-danger" disabled={busy || confirmText !== 'DELETE'} onclick={deleteSelected}>Delete permanently</button>
        {/if}
      </section>
    {/if}
    {#each matching as item (item.key)}
      <div class="tool-row"><label><input type="checkbox" bind:group={selected} value={item.key} disabled={busy}
        onchange={() => {previews = []; confirmText = '';}}> {item.title}{item.active ? '' : ' · Archived'}</label></div>
    {:else}<p>No matching situations.</p>{/each}
  {/if}
</section>

<style>
  .global-tools { padding: 1rem; margin: .75rem 0; display: grid; gap: .7rem; }
  h2,h3,p { margin: 0; }
  .tool-row { padding: .55rem 0; border-bottom: 1px solid var(--border); }
  pre { overflow: auto; max-height: 15rem; }
</style>
