<script>
  import { onMount, tick } from 'svelte';
  import GlobalLibraryTools from './GlobalLibraryTools.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Panel from '$lib/components/ui/Panel.svelte';
  import Field from '$lib/components/ui/Field.svelte';
  import Feedback from '$lib/components/ui/Feedback.svelte';
  import SectionNavigation from '$lib/components/ui/SectionNavigation.svelte';
  let {entryUrl, isAdmin, onField, onLocationChange, onPlayTest} = $props();
  let workspaces = $state([]);
  let loading = $state(true);
  let selected = $state('');
  let listing = $state(null);
  let view = $state('library');
  let manageMode = $state('transfer');
  let candidateQuery = $state('');
  let candidateSource = $state('');
  let candidateDifficulty = $state('');
  const libraryTools = [['transfer','Export'],['import','Import'],['reorder','Reorder'],['delete','Delete situations']];
  function selectSection(next, mode = manageMode) {
    manageMode = mode;
    changeView(next);
    syncLocation();
  }
  let libraryPage = $state(1);
  $effect(() => {query; difficulty; category; sourceLibrary; selected; libraryPage=1;});
  let filtersOpen = $state(false);
  let scopeQuery = $state('');
  let submissionStatus = $state('');
  let query = $state('');
  let difficulty = $state('');
  let category = $state('');
  let sourceLibrary = $state('');
  let marked = $state([]);
  let detail = $state(null);
  let detailDialog = $state(null);

  async function openDetails(entry) {
    status = '';
    detail = {entry};
    await tick();
    if (detailDialog && !detailDialog.open) detailDialog.showModal();
  }

  function closeDetails() {
    detailDialog?.close();
    detail = null;
  }
  let changeReview = $state(null);
  let historical = $state([]);
  let historicalReview = $state(null);
  let historicalFields = $state([]);
  let historicalNotes = $state('');
  const legacyFields = ['title','desc','audience','suggestedDivisions','ballLocation','category','difficulty','primaryCategory','relatedCategories',
    'outs','runnersOn','starts','targets','hit','hitType','batterAdvance','playOutcome','runnerOutcomes','playSeq','playSeq2','seqNote','boardAnimation'];
  const historicalChanges = $derived(historicalReview?.submissionType === 'update' ? legacyFields.filter(field =>
    JSON.stringify(historicalReview.situation[field]) !==
    JSON.stringify(listing?.entries.find(entry => entry.key === historicalReview.situationKey)?.[field])) : []);
  function openHistoricalReview(item) {
    historicalReview = item;
    historicalFields = [];
    historicalNotes = '';
  }
  async function decideHistorical(decision) {
    busy = true;
    try {
      await request('/api/admin/situation-submissions/' + encodeURIComponent(historicalReview.id), {
        method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({decision,notes:historicalNotes,acceptedFields:historicalFields}),
      });
      historicalReview = null;
      showStatus(decision === 'approve' ? 'Proposal approved.' : 'Proposal rejected.', 'success');
      await loadLibrary();
    } catch (error) { showStatus(error.message, 'error'); }
    finally { busy = false; }
  }
  let status = $state('');
  let statusTone = $state('info');
  function showStatus(message, tone = 'info') { status = message; statusTone = tone; }
  let busy = $state(false);
  let requestNumber = 0;
  let review = $state(null);
  let variationName = $state('');
  const scopeKey = scope => JSON.stringify([scope.type, scope.id]);
  const scopeLabel = {global:'Global Library',organization:'Organization Library',region:'Regional Library',team:'Team Library'};
  const library = $derived(workspaces.find(scope => scopeKey(scope) === selected));
  const sectionIcons = {
    library:'M8 3h12v14H8z M4 7v14h12',
    submissions:'m3 3 18 9-18 9 4-9-4-9 M7 12h14',
    reviews:'M9 4H5v17h14V4h-4 M9 3h6v4H9z m-1 11 3 3 5-6',
    'cherry-pick':'M14 3H5v18h14V8z M14 3v5h5 M8 14h8 M12 10v8',
    manage:'M4 7h16 M4 17h16 M9 4v6 M15 14v6',
    import:'M12 16V3 m-5 5 5-5 5 5 M4 15v6h16v-6',
  };
  const sections = $derived(library ? [
    {value:'library',label:'Situations'},
    ...(listing?.canReview || listing?.changeReviews.some(item => item.canReview && item.status === 'pending')
      ? [{value:'reviews',label:'Publication reviews',count:listing.incoming.length}] : []),
    ...(listing?.canCherryPick ? [{value:'cherry-pick',label:'Add from libraries'}] : []),
    ...(library.parent || listing?.changeReviews.length ? [{value:'submissions',label:'Submissions'}] : []),
    ...(isAdmin && library.type === 'global' ? [{value:'manage',label:'Manage library'}] : []),
    ...(isAdmin && ['organization','region'].includes(library.type) ? [{value:'import',label:'Import situations'}] : []),
  ] : []);
  const sourceName = entry => {
    const type = entry.sourceType || library.type;
    const name = entry.sourceName || (entry.sourceType ? '' : library.name);
    return type === 'global' || !name ? scopeLabel[type] : name + ' · ' + scopeLabel[type];
  };
  const inherited = $derived(listing?.inherited || []);
  const owned = $derived(listing?.entries || []);
  const entryId = entry => JSON.stringify([entry.key, entry.revision]);
  const filterEntries = $derived([...owned,...inherited]);
  const displayLabel = value => value.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const difficultyOptions = $derived([...new Set(filterEntries.map(entry => entry.difficulty).filter(Boolean))].sort());
  const categoriesOf = entry => [entry.primaryCategory, ...(entry.relatedCategories || [])].filter(Boolean);
  const categoryOptions = $derived([...new Set(filterEntries.flatMap(categoriesOf))].sort());
  const sourceOptions = $derived([...new Set(filterEntries.map(sourceName).filter(Boolean))].sort());
  const searchText = value => String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const searchTerms = $derived(searchText(query).split(' ').filter(Boolean));
  function matches(entry) {
    const text = searchText([entry.title,entry.displayCode,entry.desc].filter(Boolean).join(' '));
    return searchTerms.every(term => text.includes(term))
      && (!difficulty || entry.difficulty === difficulty) && (!category || categoriesOf(entry).includes(category))
      && (!sourceLibrary || sourceName(entry) === sourceLibrary);
  }
  const visible = $derived(owned.filter(matches));
  const visibleInherited = $derived(inherited.filter(matches));
  const submissionsByRevision = $derived(new Map((listing?.outgoing || [])
    .filter(item => item.destination_scope === library?.parent?.type && item.destination_id === library?.parent?.id)
    .map(item => [JSON.stringify([item.source_key,item.source_revision]),item.status])));
  const canSubmit = entry => Boolean(library?.parent && library.canDesign && listing.ownKeys.includes(entry.key)
    && !submissionsByRevision.has(entryId(entry)));
  const submitEntries = $derived(view === 'library' ? visible.filter(canSubmit) : []);
  const selectedSubmissions = $derived(submitEntries.filter(entry => marked.includes(entryId(entry))));
  const matchingIds = $derived([...new Set([...visibleInherited, ...submitEntries].map(entryId))]);
  const matchingSelection = $derived(matchingIds.filter(id => marked.includes(id)));
  const selectedInherited = $derived(visibleInherited.filter(entry => marked.includes(entryId(entry))));
  const selectedToHide = $derived(selectedInherited.filter(entry => entry.hiddenScope !== library?.type));
  const selectedToShow = $derived(selectedInherited.filter(entry => entry.hiddenScope === library?.type));
  function setVisibility(entries, hidden) {
    return action({action:'inherited_visibility',type:library.type,id:library.id,keys:entries.map(entry => entry.key),hidden},
      hidden ? 'Situations hidden in this library.' : 'Local hides removed.');
  }
  function changeView(next) {
    closeDetails();
    view = next; candidateSource=''; candidateDifficulty=''; candidateQuery = ''; query = ''; difficulty = ''; category = ''; sourceLibrary = ''; marked = [];
    changeReview = null; review = null; historicalReview = null;
  }

  async function request(url, options) {
    const response = await fetch(url, options);
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || value.message || 'Unable to update the library.');
    return value;
  }
  async function loadLibrary() {
    const sequence = ++requestNumber;
    const scope = library;
    if (!scope) return;
    listing = null;
    try {
      const params = new URLSearchParams({ type: scope.type, id: scope.id });
      const result = await request('/api/design?' + params);
      if (sequence === requestNumber) listing = result;
      if (scope.type === 'global' && isAdmin) {
        try {
          const archive = await request('/api/situation-submissions?status=pending');
          if (sequence === requestNumber) historical = archive.submissions;
        } catch (error) {
          if (sequence === requestNumber) showStatus(error.message, 'error');
        }
      }
    } catch (error) {
      if (sequence === requestNumber) showStatus(error.message, 'error');
    }
  }
  function switchLibrary(event) {
    selected = event.currentTarget.value;
    changeView('library'); status = '';
    syncLocation();
    void loadLibrary();
  }
  async function action(payload, confirmation) {
    if (busy) return false;
    status = '';
    busy = true;
    try {
      const result = await request('/api/design', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      showStatus(typeof confirmation === 'function' ? confirmation(result) : confirmation, 'success');
      review = null;
      changeReview = null;
      closeDetails();
      await loadLibrary();
      return true;
    } catch (error) { showStatus(error.message, 'error'); return false; }
    finally { busy = false; }
  }
  const source = entry => ({sourceKey: entry.key, sourceRevision: entry.revision});
  const editLink = entry => '/coach-board?' + new URLSearchParams({
    design: library.type, id: library.id, ...(entry ? {key: entry.key} : {}),
  });
  const draftLink = (entry, intent) => '/coach-board?' + new URLSearchParams({
    design:library.type,id:library.id,key:entry.key,revision:entry.revision,intent,
  });
  async function submitForReview(entries) {
    if (busy) return;
    const destination = scopeLabel[library.parent.type];
    status = '';
    busy = true;
    let submitted = 0;
    let failure = '';
    try {
      for (const entry of entries) {
        try {
          const result = await request('/api/design', {method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({action:'submit',...source(entry)})});
          if (result.promotion?.status === 'pending') submitted++;
        } catch (error) { failure = error.message; }
      }
      status = submitted ? `Submitted ${submitted} of ${entries.length} to the ${destination} for review.` : failure || 'These revisions have already been reviewed.';
      statusTone = failure ? (submitted ? 'warning' : 'error') : 'success';
      if (submitted && failure) status += ' ' + failure;
      marked = [];
      closeDetails();
      await loadLibrary();
    } finally { busy = false; }
  }

  function startReview(item) {
    review = item;
    variationName = '';
  }
  function playTest(snapshot) {
    try {
      onPlayTest(snapshot);
    } catch (error) { showStatus(error.message, 'error'); }
  }

  async function playTestCandidate(entry) {
    if (busy) return;
    status = '';
    busy = true;
    try {
      const {snapshot} = await request('/api/design', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'preview_candidate',type:library.type,id:library.id,...source(entry)})});
      playTest(snapshot);
    } catch (error) { showStatus(error.message, 'error'); }
    finally { busy = false; }
  }

  async function cherryPick(entry) {
    const result = await action({ action:'cherry_pick', type:library.type, id:library.id, ...source(entry) }, 'Revision published to this library.');
    if (!result && (status.startsWith('Review update') || status.includes('waiting in Publication reviews'))) {
      await loadLibrary();
      const pending = listing?.incoming.find(item => item.source_key === entry.key && item.source_revision === entry.revision);
      if (pending) { selectSection('reviews'); startReview(pending); }
    }
  }
  function syncLocation() {
    if (!library) return;
    const url = new URL('/workspace/design', entryUrl);
    url.searchParams.set('type',library.type);
    if (library.id) url.searchParams.set('id',library.id);
    if (view !== 'library') url.searchParams.set('view',view);
    onLocationChange(url);
  }
  onMount(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await request('/api/design');
        if (cancelled) return;
        workspaces = result.workspaces;
        const preferred = workspaces.find(scope => scope.type === entryUrl.searchParams.get('type')
          && scope.id === (entryUrl.searchParams.get('id') || '')) || workspaces[0];
        if (!preferred) return;
        selected = scopeKey(preferred);
        const requested = entryUrl.searchParams.get('view');
        if (requested === 'submissions') view = 'submissions';
        if (requested === 'manage' && isAdmin && preferred.type === 'global') view = 'manage';
        if (requested === 'import' && isAdmin && ['organization','region'].includes(preferred.type)) view = 'import';
        if (requested === 'reviews' || requested === 'cherry-pick') view = requested;
        await loadLibrary();
        if (!cancelled && view === 'reviews' && !listing?.canReview
          && !listing?.changeReviews.some(item => item.canReview)) view = 'library';
        if (!cancelled && view === 'cherry-pick' && !listing?.canCherryPick) view = 'library';
      } catch (error) {
        if (!cancelled) showStatus(error.message, 'error');
      } finally {
        if (!cancelled) loading = false;
      }
    };
    void load();
    return () => { cancelled = true; requestNumber++; };
  });
</script>

{#snippet situationActions(entry, full = false)}
  {@const owner = !entry.sourceType}
  {@const editable = owner && library.canDesign}
  {#if !owner}
    <button disabled={busy} onclick={() => setVisibility([entry],entry.hiddenScope !== library.type)}>{entry.hiddenScope === library.type ? 'Show here' : 'Hide here'}</button>
  {:else}
    {#if editable}<a data-sveltekit-reload href={editLink(entry)}>Edit</a>{/if}
    {#if editable && library.parent}
      {#if canSubmit(entry)}
        <button disabled={busy} onclick={() => submitForReview([entry])}>Submit for review</button>
      {:else}
        <span class="muted">{submissionsByRevision.get(entryId(entry)) === 'pending' ? 'In review' : displayLabel(submissionsByRevision.get(entryId(entry)) || '')}</span>
      {/if}
    {/if}
  {/if}
  {#if full}
    {#if editable}
      <button disabled={busy} onclick={() => {
        if (window.confirm(`Archive ${entry.title}?`)) void action({action:'archive',type:library.type,id:library.id,...source(entry)},'Situation archived.');
      }}>Archive</button>
    {/if}
    {#if library.canDesign}
      {#if !owner}<a data-sveltekit-reload href={draftLink(entry,'propose')}>Propose update</a>{/if}
      <a data-sveltekit-reload href={draftLink(entry,'variation')}>Create variation</a>
    {/if}
  {/if}
{/snippet}

<svelte:window onkeydown={event=>{
  if(event.key!=='Escape')return;
  const picker=document.querySelector('#designWorkspace .design-library-switcher[open]');
  if(picker && picker.contains(document.activeElement)){picker.open=false;picker.querySelector('summary')?.focus();}
}} />

<main class="design-dashboard" id="designWorkspace">
  <aside class="design-sidebar"><h2>Design</h2>
    <details class="design-library-switcher">
      <summary><span><strong>{library?.name || 'Choose library'}</strong>{#if library && library.name!==scopeLabel[library.type]}<small>{scopeLabel[library.type]}</small>{/if}</span><span aria-hidden="true">⌄</span></summary>
      <div class="design-library-options">
        <label class="field">Find a library<input type="search" placeholder="Team, region or library" bind:value={scopeQuery}></label>
        <div class="design-library-results">
          {#each workspaces.filter(scope=>(scope.name+' '+scopeLabel[scope.type]).toLowerCase().includes(scopeQuery.toLowerCase())) as scope}
            <button type="button" disabled={busy} aria-current={scopeKey(scope)===selected?'true':undefined} onclick={event=>{switchLibrary({currentTarget:{value:scopeKey(scope)}});event.currentTarget.closest('details').open=false;}}><strong>{scope.name}</strong><small>{scopeLabel[scope.type]}</small></button>
          {:else}<p>No matching libraries.</p>{/each}
        </div>
      </div>
    </details>
    {#if library}
      <nav id="design-sections" class="design-sidebar-nav" aria-label="Design sections">
        {#each sections as section (section.value)}
          <button type="button" aria-current={view===section.value?'page':undefined} onclick={() => selectSection(section.value)}><svg class="design-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={sectionIcons[section.value] || sectionIcons.library}/></svg><span class="design-nav-label">{section.label}</span>{#if section.count}<span class="design-nav-count">{section.count}</span>{/if}</button>
        {/each}
      </nav>
    {/if}
  </aside>
  <PageHeader title={sections.find(section=>section.value===view)?.label || 'Design workspace'}
    context={view==='library'?'Create and organize situations for this library.':view==='submissions'?'Track situations and updates submitted for review.':view==='reviews'?'Review proposed situations and publication updates.':view==='manage'?'Manage library content and transfers.':view==='cherry-pick'?'Choose situations to publish into this library.':'Import situations into this library.'}>
    {#snippet actions()}
      {#if library?.canDesign && view === 'library'}<a class="dd-button" data-variant="primary" data-sveltekit-reload href={editLink()}>+ New situation</a>{/if}
      <Button variant="secondary" disabled={busy || loading} onclick={() => loadLibrary()} aria-label="Refresh design workspace"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg></Button>
    {/snippet}
  </PageHeader>
  <Feedback message={status} tone={statusTone} />
  {#if library}
    <Panel class="workspace-frame" padded={false}>
      <div class="workspace-content">
    {#if view === 'manage' && isAdmin && library.type === 'global'}
      <SectionNavigation label="Global Library tools" secondary
        items={libraryTools.map(([value,label]) => ({value,label}))} value={manageMode}
        onchange={mode => selectSection('manage',mode)} />
      {#key manageMode}<GlobalLibraryTools {request} refresh={loadLibrary} mode={manageMode} destination={library} />{/key}
    {:else if view === 'import' && isAdmin && ['organization','region'].includes(library.type)}
      <GlobalLibraryTools {request} refresh={loadLibrary} mode="import" destination={library} />
    {:else if !listing}
      {#if !status}<p>Loading library…</p>{/if}
    {:else if view === 'library'}
      <section class="card design-library-content" aria-label={scopeLabel[library.type]}>
        <div class="toolbar workspace-toolbar">
          <div class="filters">
            <label class="field">Search situations <input class="input" type="search" bind:value={query}></label>
            <label class="field">Difficulty <select class="select" bind:value={difficulty}>
              <option value="">All difficulties</option>
              {#each difficultyOptions as value}<option {value}>{displayLabel(value)}</option>{/each}
            </select></label>
            <label class="field">Category <select class="select" bind:value={category}>
              <option value="">All categories</option>
              {#each categoryOptions as value}<option {value}>{displayLabel(value)}</option>{/each}
            </select></label>
            <button class="design-filter-button" aria-expanded={filtersOpen} aria-controls="design-extra-filters" onclick={() => filtersOpen=!filtersOpen}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6M15 14v6"/></svg>Filters{sourceLibrary ? ' · 1 active' : ''}</button>
            <button disabled={!query && !difficulty && !category && !sourceLibrary} onclick={() => {query='';difficulty='';category='';sourceLibrary='';}}>Clear filters</button>
          </div>
          <div class="design-extra-filters" id="design-extra-filters" hidden={!filtersOpen}>
            <label class="field">Source library <select class="select" bind:value={sourceLibrary}>
              <option value="">All sources</option>
              {#each sourceOptions as value}<option {value}>{value}</option>{/each}
            </select></label>

          {#if library.type === 'team' && view === 'library'}
            <label class="field">Inherited difficulty
              <select class="select" value={listing.maximumDifficulty} disabled={busy} onchange={event => action({
                action:'inherited_difficulty',type:library.type,id:library.id,maximum:event.currentTarget.value,
              }, 'Team difficulty saved.')}>
                <option value="all">All difficulties</option>
                <option value="foundational">Foundational only</option>
                <option value="intermediate">Foundational and intermediate</option>
              </select>
            </label>
          {/if}
          </div>
          {#if matchingIds.length || marked.length}
            <div class="selection-toolbar" role="group" aria-label="Situation selection"><span class="design-result-count">{visible.length + visibleInherited.length} situations</span>
              {#if matchingIds.length}
                <button disabled={busy || matchingSelection.length === matchingIds.length}
                  onclick={() => marked = matchingIds}>Select matching ({matchingIds.length})</button>
              {/if}
              {#if marked.length}
                <span class="selection-count" aria-live="polite">{matchingSelection.length} selected</span>
                {#if selectedSubmissions.length}<button disabled={busy} onclick={() => submitForReview(selectedSubmissions)}>Submit selected for review ({selectedSubmissions.length})</button>{/if}
                {#if selectedToHide.length}<button disabled={busy} onclick={() => setVisibility(selectedToHide,true)}>Hide selected ({selectedToHide.length})</button>{/if}
                {#if selectedToShow.length}<button disabled={busy} onclick={() => setVisibility(selectedToShow,false)}>Show selected ({selectedToShow.length})</button>{/if}
                <button disabled={busy} onclick={() => marked = []}>Clear selection</button>
              {/if}
            </div>
          {/if}
        </div>
        {#each [
          {label:'',entries:visible},
          ...(library.type !== 'global' ? [{label:'Inherited situations',entries:visibleInherited}] : []),
        ] as group}
          {@const pageEntries = group.entries.slice((libraryPage-1)*15,libraryPage*15)}
          {@const selectableIds = pageEntries.map(entryId).filter(id=>matchingIds.includes(id))}
          {@const selectRows = group.entries.some(entry => matchingIds.includes(entryId(entry)))}
          {#if group.label}<h2>{group.label}</h2>{/if}
          {#if group.entries.length}
            <div class="admin-access-table-wrap">
              <table class="admin-access-table library-table" aria-label={group.label || scopeLabel[library.type]}>
                <thead><tr>
                  {#if selectRows}<th scope="col" class="select-column"><input type="checkbox" aria-label="Select current page" disabled={busy || !selectableIds.length} checked={selectableIds.length>0 && selectableIds.every(id=>marked.includes(id))} indeterminate={selectableIds.some(id=>marked.includes(id)) && !selectableIds.every(id=>marked.includes(id))} onchange={event=>{marked=event.currentTarget.checked?[...new Set([...marked,...selectableIds])]:marked.filter(id=>!selectableIds.includes(id));}}></th>{/if}
                  <th scope="col">Situation</th><th scope="col" class="difficulty-column">Difficulty</th><th scope="col" class="source-column">Source</th><th scope="col" class="revision-column">Revision</th><th scope="col" class="availability-column">Availability</th><th scope="col" class="actions-column">Actions</th>
                </tr></thead>
                <tbody>
                  {#each pageEntries as entry}
                    <tr data-situation-key={entry.key} class:selected-row={marked.includes(entryId(entry))} class:selectable-row={matchingIds.includes(entryId(entry))} tabindex={matchingIds.includes(entryId(entry))?0:undefined}
                      onclick={event=>{if(busy || event.target.closest('button,a,input,select,details') || !matchingIds.includes(entryId(entry)))return;marked=marked.includes(entryId(entry))?marked.filter(id=>id!==entryId(entry)):[...marked,entryId(entry)];}}
                      onkeydown={event=>{if(event.target!==event.currentTarget || ![' ','Enter'].includes(event.key) || busy || !matchingIds.includes(entryId(entry)))return;event.preventDefault();marked=marked.includes(entryId(entry))?marked.filter(id=>id!==entryId(entry)):[...marked,entryId(entry)];}}>
                      {#if selectRows}<td>
                        {#if matchingIds.includes(entryId(entry))}
                          <input type="checkbox" bind:group={marked} value={entryId(entry)} disabled={busy} aria-label={'Select ' + entry.title}>
                        {/if}
                      </td>{/if}
                      <td><h3><button class="situation-title" aria-haspopup="dialog" onclick={() => openDetails(entry)}>{entry.title}</button></h3>
                      </td><td>{entry.difficulty?displayLabel(entry.difficulty):'—'}</td>
                      <td>{sourceName(entry)}</td><td>{entry.revision}</td>
                      <td>{entry.sourceType ? (entry.hiddenScope ? (entry.hiddenScope === library.type ? 'Hidden here' : 'Hidden by ' + (entry.hiddenScope === 'organization' ? 'organization' : 'region')) : entry.difficultyFiltered ? 'Outside team difficulty' : 'Inherited')
                        : library.type === 'team' ? 'In free play' : 'Published here'}
                      </td>
                      <td><div class="actions row-actions">
                        {@render situationActions(entry)}
                      </div></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else if group.label || library.type === 'global' || !visibleInherited.length}<p>{query || difficulty || category || sourceLibrary ? 'No matching situations.' : 'No situations in this list.'}</p>{/if}
        {/each}
        <div class="design-pagination"><span>{visible.length + visibleInherited.length} situations · Page {libraryPage} of {Math.max(1,Math.ceil(Math.max(visible.length,visibleInherited.length)/15))}</span><button disabled={libraryPage===1} onclick={() => libraryPage-=1}>← Previous</button><button disabled={libraryPage*15>=Math.max(visible.length,visibleInherited.length)} onclick={() => libraryPage+=1}>Next →</button></div>
      </section>
    {:else if view === 'reviews'}
      <section aria-label="Publication reviews">
        {#each listing.changeReviews.filter(item => item.canReview && item.status === 'pending') as item}
          <article><div><h3>{item.original.title}</h3><p>Proposed update · based on revision {item.revision}</p></div>
            <button onclick={() => changeReview = item}>Review proposed update</button></article>
        {/each}
        {#if library.type === 'global' && isAdmin}
          {#each historical as item (item.id)}
            <article><div><h3>{item.situation.title}</h3><p>{item.submitterName} · {item.submissionType === 'create' ? 'New situation' : 'Update'} </p></div>
              <button onclick={() => openHistoricalReview(item)}>Review proposal</button></article>
          {/each}
        {/if}
        <h2>Pending publication submissions</h2>
        {#each listing.incoming as item}
          <article>
            <div><h3>{item.sourceTitle}</h3><p>{item.sourceLibraryName ? item.sourceLibraryName + ' · ' : ''}Revision {item.source_revision}{item.stale ? ' · Source changed' : ''}</p></div>
            <button onclick={() => startReview(item)}>{item.existing || item.stale ? 'Review update' : 'Review submission'}</button>
          </article>
        {:else}<p>No pending submissions.</p>{/each}
      </section>
    {:else if view === 'cherry-pick'}
      <section class="design-candidates" aria-label="Add from libraries">
        <p class="design-destination">Destination: <strong>{library.type==='global'?scopeLabel.global:library.name+' · '+scopeLabel[library.type]}</strong></p>
        <div class="filters toolbar workspace-toolbar">
          <label class="field">Search situations<input type="search" placeholder="Situation name" bind:value={candidateQuery}></label>
          <label class="field">Source library<select bind:value={candidateSource}><option value="">All source libraries</option>{#each listing.sourceEntries as group}<option value={scopeKey(group.scope)}>{group.path} · {scopeLabel[group.scope.type]}</option>{/each}</select></label>
          <label class="field">Difficulty<select bind:value={candidateDifficulty}><option value="">All difficulties</option>{#each [...new Set(listing.sourceEntries.flatMap(group=>group.entries.map(entry=>entry.difficulty)).filter(Boolean))].sort() as level}<option value={level}>{displayLabel(level)}</option>{/each}</select></label>
          <button disabled={!candidateQuery && !candidateSource && !candidateDifficulty} onclick={()=>{candidateQuery='';candidateSource='';candidateDifficulty='';}}>Clear filters</button>
        </div>
        <div class="admin-access-table-wrap"><table class="design-candidate-table" aria-label="Eligible situations"><thead><tr><th scope="col">Situation</th><th scope="col">Source library</th><th scope="col">Difficulty</th><th scope="col">Revision</th><th scope="col">Actions</th></tr></thead><tbody>
          {#each listing.sourceEntries.filter(group=>!candidateSource || scopeKey(group.scope)===candidateSource).flatMap(group=>group.entries.filter(entry=>searchText(entry.title).includes(searchText(candidateQuery)) && (!candidateDifficulty || entry.difficulty===candidateDifficulty)).map(entry=>({entry,group}))) as candidate}
            <tr><td><button class="situation-title" disabled={busy} onclick={()=>playTestCandidate(candidate.entry)}>{candidate.entry.title}</button></td><td>{candidate.group.path} · {scopeLabel[candidate.group.scope.type]}</td><td>{candidate.entry.difficulty?displayLabel(candidate.entry.difficulty):'—'}</td><td>{candidate.entry.revision}</td><td><div class="actions row-actions"><button disabled={busy} onclick={()=>playTestCandidate(candidate.entry)}>Preview</button><button class="dd-button" data-variant="primary" disabled={busy} onclick={()=>cherryPick(candidate.entry)}>Add to library</button></div></td></tr>
          {:else}<tr><td colspan="5">No eligible situations match these filters.</td></tr>{/each}
        </tbody></table></div>
      </section>
    {:else if view === 'submissions'}
      <section aria-label="Submissions">
        <h2>Submissions</h2><label class="field candidate-search">Status<select bind:value={submissionStatus}><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="withdrawn">Withdrawn</option></select></label>
        {#if listing.canReview}
          <button onclick={() => selectSection('reviews')}>View incoming reviews{listing.incoming.length ? ' (' + listing.incoming.length + ')' : ''}</button>
        {/if}
        {#each listing.changeReviews.filter(item=>!submissionStatus || item.status===submissionStatus) as item}
          <article><h3>{item.original.title}</h3><p>Proposed update · <span class="design-status" data-status={item.status}>{displayLabel(item.status)}</span></p></article>
        {/each}
        <div class="admin-access-table-wrap"><table aria-label="Sent submissions"><thead><tr><th scope="col">Situation</th><th scope="col">Destination</th><th scope="col">Revision</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>
        {#each listing.outgoing.filter(item=>!submissionStatus || item.status===submissionStatus) as item}
          <tr><td>{item.source_title}</td><td>{item.destination_name}</td><td>{item.source_revision}</td><td><span class="design-status" data-status={item.status}>{displayLabel(item.status)}</span></td><td>
            {#if item.canWithdraw}<button disabled={busy} onclick={() => {
              if(window.confirm('Withdraw this submission? You can submit this revision again.'))void action({action:'withdraw_submission',promotionId:item.id},'Submission withdrawn.');
            }}>Withdraw submission</button>{:else}—{/if}
          </td></tr>
        {:else}<tr><td colspan="5">No submissions match this view.</td></tr>{/each}
        </tbody></table></div>
      </section>
    {/if}
    {#if historicalReview}
      <section aria-label="Review legacy proposal">
        <h2>{historicalReview.situation.title}</h2>
        <p>{historicalReview.rationale}</p>
        {#if historicalReview.submissionType === 'update'}
          {#each historicalChanges as field}
            <label><input type="checkbox" value={field} bind:group={historicalFields}> Apply {displayLabel(field)}</label>
            <details><summary>Compare {displayLabel(field)}</summary>
              <pre>Current: {JSON.stringify(listing.entries.find(item => item.key === historicalReview.situationKey)?.[field],null,2)}{'\n'}Proposed: {JSON.stringify(historicalReview.situation[field],null,2)}</pre>
            </details>
          {/each}
        {:else}
          <details><summary>Proposed situation</summary><pre>{JSON.stringify(historicalReview.situation,null,2)}</pre></details>
        {/if}
        <label>Review notes <textarea bind:value={historicalNotes}></textarea></label>
        <div class="actions">
          <button disabled={busy} onclick={() => playTest(historicalReview.situation)}>Play-test proposal</button>
          <button disabled={busy || (historicalReview.submissionType === 'update' && !historicalFields.length)} onclick={() => decideHistorical('approve')}>Approve proposal</button>
          <button disabled={busy || !historicalNotes.trim()} onclick={() => decideHistorical('reject')}>Reject proposal</button>
          <button disabled={busy} onclick={() => historicalReview = null}>Close review</button>
        </div>
      </section>
    {/if}
    {#if changeReview}
      <section class="inset" aria-label="Review proposed update">
        <h2>{changeReview.original.title}</h2>
        {#if changeReview.stale}<p>The published revision changed after this draft started.</p>{/if}
        <div class="comparison">
          <details open><summary>Published revision {changeReview.revision}</summary><p>{changeReview.original.desc}</p><pre>{JSON.stringify(changeReview.original,null,2)}</pre></details>
          <details open><summary>Proposed update</summary><p>{changeReview.proposed.desc}</p><pre>{JSON.stringify(changeReview.proposed,null,2)}</pre></details>
        </div>
        <div class="actions">
          <button disabled={busy} onclick={() => playTest(changeReview.proposed)}>Play-test proposed update</button>
          <button class="primary" disabled={busy || changeReview.stale} onclick={() => action({action:'review_change',proposalId:changeReview.id,resolution:'approve'},'Update published.')}>Approve update</button>
          <button disabled={busy} onclick={() => action({action:'review_change',proposalId:changeReview.id,resolution:'reject'},'Update rejected.')}>Reject update</button>
          <button onclick={() => changeReview = null}>Close</button>
        </div>
      </section>
    {/if}
    {#if detail}
      <dialog class="situation-detail dd-detail-panel" bind:this={detailDialog} aria-labelledby="situation-detail-title"
        onclose={() => detail = null}>
        <div class="detail-heading">
          <h2 id="situation-detail-title">{detail.entry.title}</h2>
          <Button variant="ghost" onclick={closeDetails}>Close</Button>
        </div>
        {#if detail.entry.desc}<p>{detail.entry.desc}</p>{/if}
        <dl>
          <div><dt>Source library</dt><dd>{sourceName(detail.entry)}</dd></div>
          <div><dt>Revision</dt><dd>{detail.entry.revision}</dd></div>
          {#if detail.entry.difficulty}<div><dt>Difficulty</dt><dd>{displayLabel(detail.entry.difficulty)}</dd></div>{/if}
          {#if categoriesOf(detail.entry).length}<div><dt>Categories</dt><dd>{categoriesOf(detail.entry).map(displayLabel).join(', ')}</dd></div>{/if}
        </dl>
        <div class="actions detail-actions">{@render situationActions(detail.entry, true)}</div>
        {#if status}<p role="alert">{status}</p>{/if}
      </dialog>
    {/if}
    {#if review}
      <section class="inset" aria-label="Review publication">
        <h2>{review.sourceTitle}</h2>
        <p>{review.sourceLibraryName ? review.sourceLibraryName + ' · ' : ''}Revision {review.source_revision}</p>
        <p>Destination {library.type === 'global' ? scopeLabel.global : library.name + ' · ' + scopeLabel[library.type]}</p>
        {#if review.stale}<p>The source revision or its scope changed. Review the latest revision before approving.</p>{/if}
        {#if review.existing}
          <div class="comparison">
            <details open><summary>Current · revision {review.existing.revision}</summary><p>{review.existing.desc}</p><pre>{JSON.stringify(review.existing, null, 2)}</pre></details>
            <details open><summary>Incoming · revision {review.source_revision}</summary><p>{review.incoming?.desc}</p><pre>{JSON.stringify(review.incoming, null, 2)}</pre></details>
          </div>
          <label>Variation name <input bind:value={variationName}></label>
        {/if}
        <div class="actions">
          {#if review.incoming}<button disabled={busy} onclick={() => playTest({...review.incoming, key:review.source_key, revision:review.source_revision})}>Play-test incoming revision</button>{/if}
          {#if review.existing}
            <button disabled={busy} onclick={() => playTest(review.existing)}>Play-test current revision</button>
            <button disabled={busy || review.stale} onclick={() => action({action:'approve',promotionId:review.id,resolution:'keep',destinationRevision:review.existing.revision},'Kept the current library version.')}>Keep current</button>
            <button class="primary" disabled={busy || review.stale} onclick={() => action({action:'approve',promotionId:review.id,resolution:'adopt',destinationRevision:review.existing.revision},'Incoming revision published.')}>Adopt incoming</button>
            <button disabled={busy || review.stale || !variationName.trim()} onclick={() => action({action:'approve',promotionId:review.id,resolution:'variation',destinationRevision:review.existing.revision,title:variationName},'Named variation published.')}>Publish as variation</button>
          {:else}
            <button class="primary" disabled={busy || review.stale} onclick={() => action({action:'approve',promotionId:review.id},'Revision approved and published.')}>Approve and publish</button>
          {/if}
          <button disabled={busy} onclick={() => action({action:'reject',promotionId:review.id},'Submission rejected.')}>Reject</button>
          <button onclick={() => review = null}>Close review</button>
        </div>
      </section>
    {/if}
      </div>
    </Panel>
  {:else if loading}<p>Loading libraries…</p>
  {:else if !status}<p>Your account has no assigned design workspace.</p>{/if}
</main>

<style>
  .actions,.toolbar {display:flex;align-items:center;flex-wrap:wrap;gap:.6rem;}
  a,button,select,input {font:inherit;}
  button,a:not(.dd-button) {padding:.55rem .7rem;border:1px solid #b6c4d4;border-radius:.5rem;background:var(--surface);color:var(--text-primary);text-decoration:none;cursor:pointer;}
  button:disabled {cursor:default;opacity:.55;}
  main {width:100%;box-sizing:border-box;margin:var(--space-3) auto;padding:0 var(--page-gutter);}
  :global(#designWorkspace > .dd-page-header) {margin-bottom:var(--workspace-gap);}
  .toolbar.workspace-toolbar {justify-content:flex-start;align-items:end;gap:.75rem 1.25rem;margin-bottom:.75rem;}
  .filters > .field:first-child {width:clamp(12rem, 22vw, 20rem);}
  .filters {display:flex;align-items:end;gap:.6rem;flex-wrap:wrap;}
  .selection-toolbar {display:flex;align-items:center;flex-wrap:wrap;gap:.45rem;}
  .selection-toolbar button {min-height:var(--workspace-control-height);}
  .candidate-search {max-width:24rem;margin:.75rem 0;}
  .selection-count {font-weight:650;white-space:nowrap;}
  .row-actions {gap:.35rem;align-items:start;}
  .row-actions :is(button,a) {box-sizing:border-box;min-height:2rem;padding:.3rem .55rem;}
  .library-table {table-layout:fixed;min-width:48rem;}
  .library-table .select-column {width:2rem;}
  .library-table .source-column {width:18%;}
  .library-table .revision-column {width:4.5rem;}
  .library-table .availability-column {width:16%;}
  .library-table .actions-column {width:14rem;}
  .library-table thead {background:var(--surface-raised);}
  .library-table :is(th,td) {padding:var(--table-cell-block) var(--table-cell-inline);overflow-wrap:anywhere;}
  .library-table tbody tr:hover {background:var(--surface-hover);}
  .library-table tbody tr.selected-row {background:var(--selection-background);}
  .situation-title {min-height:0;padding:0;border:0;background:none;text-align:start;font-weight:700;
    text-decoration:underline;text-decoration-color:var(--border-emphasis);text-underline-offset:.18em;}
  .situation-title:hover:not(:disabled) {text-decoration-color:currentColor;transform:none;box-shadow:none;}
  .situation-detail {box-sizing:border-box;position:fixed;inset:0 0 0 auto;margin:0;width:min(100%,var(--detail-panel-width));
    max-width:none;height:100%;max-height:100%;padding:1.25rem;overflow:auto;color:inherit;background:var(--surface);
    border:0;border-inline-start:1px solid var(--border);}
  .situation-detail::backdrop {background:rgb(8 36 67 / .35);}
  .detail-heading {display:flex;align-items:start;justify-content:space-between;gap:1rem;}
  .detail-heading h2 {font-size:1.25rem;}
  .situation-detail dl {display:grid;gap:.65rem;margin:1rem 0;padding:.75rem;background:var(--surface-hover);border-radius:.5rem;}
  .situation-detail dl div {display:grid;grid-template-columns:7rem 1fr;gap:.5rem;}
  .situation-detail dt {color:var(--text-secondary);}
  .situation-detail dd {margin:0;font-weight:600;}
  .detail-actions {margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border);}
  .detail-actions:empty {display:none;}
  .workspace-toolbar .field :is(input,select) {box-sizing:border-box;width:100%;height:var(--workspace-control-height);}

  h2,h3,p {margin:0;}
  h2,h3 {font-size:1rem;}
  p {margin-top:.35rem;color:#435873;}
  .toolbar,article {display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;}
  section {background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-panel);padding:1rem;margin:.75rem 0;}
  section > h2 {margin:.5rem 0;}
  article {padding:.75rem 0;border-bottom:1px solid #d7e1eb;}
  .primary {color:white!important;background:#082443!important;}
  label {display:grid;gap:.25rem;}
  select,input {padding:.45rem;border:1px solid #8b9fb8;border-radius:.4rem;max-width:100%;}
  .inset .actions {margin-top:.75rem;}
  .comparison {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr));gap:.75rem;margin:.75rem 0;}
  pre {height:14rem;overflow:auto;background:#f4f7fa;padding:.5rem;font-size:.78rem;}
</style>
