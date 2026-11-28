<script>
  import { onMount, tick } from 'svelte';
  import SituationSummary from '$lib/components/SituationSummary.svelte';
  import {qualifiedSituationLabel} from '$lib/domain/situation-identity';
  import {libraryCardModel} from '$lib/plays/library-card.js';
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
  let rejection = $state(null);
  let rejectionNotes = $state('');
  let rejectionDialog = $state(null);
  async function openRejection(item, readonly = false) {
    rejection = {item, readonly};
    rejectionNotes = readonly ? item.review_notes || '' : '';
    await tick();
    rejectionDialog?.showModal();
  }
  async function rejectSubmission() {
    if (await action({action:'reject', promotionId:rejection.item.id, explanation:rejectionNotes}, 'Submission rejected.')) {
      rejectionDialog?.close();
      rejection = null;
    }
  }
  let changeReview = $state(null);
  const changeLabels = {desc:'Description',starts:'Starting positions',targets:'Scoring targets',tol:'Tolerance',hit:'Batted-ball destination',hitType:'Hit type',playSeq:'Primary throw sequence',playSeq2:'Secondary throw sequence',seqNote:'Sequence notes',runnersOn:'Starting runners',playOutcome:'Play outcome',runnerOutcomes:'Runner outcomes',boardAnimation:'Play timeline',outs:'Starting outs',batterAdvance:'Batter advance',primaryCategory:'Primary category',relatedCategories:'Related categories',suggestedDivisions:'Suggested divisions'};
  function changeLabel(key) {return changeLabels[key] || (/^(P|C|1B|2B|3B|SS|LF|CF|RF)$/.test(key)?key:String(key).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[-_]/g,' ').replace(/^./,letter=>letter.toUpperCase()));}
  function changeValue(value) {
    if(value===undefined || value===null || value==='')return 'Not set';
    if(typeof value==='boolean')return value?'Yes':'No';
    if(Array.isArray(value))return value.length?value.map(changeValue).join(' → '):'None';
    if(typeof value==='number')return String(value);
    return String(value);
  }
  function proposalChanges(item) {
    const rows=[];
    function visit(before,after,path) {
      if(JSON.stringify(before)===JSON.stringify(after))return;
      if((before && typeof before==='object' && !Array.isArray(before)) || (after && typeof after==='object' && !Array.isArray(after))) {
        for(const key of new Set([...Object.keys(before || {}),...Object.keys(after || {})]))visit(before?.[key],after?.[key],[...path,changeLabel(key)]);
      } else if(Array.isArray(before) && before.some(value=>value && typeof value==='object') || Array.isArray(after) && after.some(value=>value && typeof value==='object')) {
        for(let i=0;i<Math.max(before?.length || 0,after?.length || 0);i++)visit(before?.[i],after?.[i],[...path,'Step '+(i+1)]);
      } else rows.push({field:path.join(' · '),before:changeValue(before),after:changeValue(after)});
    }
    for(const field of legacyFields)visit(item.original[field],item.proposed[field],[changeLabel(field)]);
    return rows;
  }

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
  let statusTimer;
  function clearStatus(){clearTimeout(statusTimer);status='';}
  function showStatus(message, tone = 'info') {
    clearStatus();status=message;statusTone=tone;
    if(tone==='success')statusTimer=setTimeout(()=>{status='';},6000);
  }
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
    && (!submissionsByRevision.has(entryId(entry)) || submissionsByRevision.get(entryId(entry)) === 'rejected'));
  const submitEntries = $derived(view === 'library' ? visible.filter(canSubmit) : []);
  const selectedOwnedSituations = $derived(library?.canDesign ? visible.filter(entry=>!entry.sourceType && marked.includes(entryId(entry))) : []);
  async function archiveSelectedSituations(){
    const entries=[...selectedOwnedSituations];
    if(!entries.length || !window.confirm(`Remove ${entries.length} situation${entries.length===1?'':'s'} from ${library.name}? They will be archived; existing records are retained.`))return;
    for(const entry of entries){
      const ok=await action({action:'archive',type:library.type,id:library.id,...source(entry)},'Situation removed from this library.');
      if(!ok)break;
    }
  }
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
    clearStatus();
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

  function togglePublicationMenu(event,item){
    const trigger=event.currentTarget;
    const menu=document.getElementById(item.menuId || 'publication-actions-'+item.id);
    if(menu.matches(':popover-open')){menu.hidePopover();return;}
    menu.showPopover();
    const bounds=trigger.getBoundingClientRect();
    const height=menu.getBoundingClientRect().height;
    menu.style.left=Math.max(12,Math.min(window.innerWidth-232,bounds.right-220))+'px';
    menu.style.top=Math.max(12,bounds.bottom+height+8>window.innerHeight?bounds.top-height-6:bounds.bottom+6)+'px';
  }
  function closePublicationMenu(item){document.getElementById('publication-actions-'+item.id)?.hidePopover();}
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
    return () => { cancelled = true; requestNumber++; clearTimeout(statusTimer); };
  });
</script>

{#snippet situationActions(entry, full = false)}
  {@const owner = !entry.sourceType}
  {@const editable = owner && library.canDesign}
  {#if !owner}
    <button disabled={busy} onclick={() => setVisibility([entry],entry.hiddenScope !== library.type)}>{entry.hiddenScope === library.type ? 'Show in this library' : 'Hide from this library'}</button>
  {:else}
    {#if editable}<a data-sveltekit-reload href={editLink(entry)}>Edit</a>{/if}
    {#if editable && library.parent}
      {#if canSubmit(entry)}
        <button disabled={busy} onclick={() => submitForReview([entry])}>{submissionsByRevision.get(entryId(entry)) === 'rejected' ? 'Resubmit for review' : 'Submit for review'}</button>
      {:else}
        <span class="muted">{submissionsByRevision.get(entryId(entry)) === 'pending' ? 'In review' : displayLabel(submissionsByRevision.get(entryId(entry)) || '')}</span>
      {/if}
    {/if}
  {/if}
  {#if editable}
    <button class="design-remove-action" disabled={busy} title="Archive this situation from its owning library" onclick={() => {
      if (window.confirm(`Archive “${qualifiedSituationLabel(entry)}” from ${library.name}? It will no longer be available from this library. Existing records are retained.`)) void action({action:'archive',type:library.type,id:library.id,...source(entry)},'Situation archived.');
    }}>Remove from library</button>
  {/if}
  {#if full}
    {#if library.canDesign}
      {#if !owner}<a data-sveltekit-reload href={draftLink(entry,'propose')}>Propose update</a>{/if}
      <a data-sveltekit-reload href={draftLink(entry,'variation')}>Create variation</a>
    {/if}
  {/if}
{/snippet}

{#snippet proposalMenu(item, suffix = '')}
  {@const menuId='proposal-actions-'+item.id+suffix}
  <button class="design-menu-trigger" type="button" aria-label={'Actions for '+item.original.title} aria-haspopup="true" popovertarget={menuId} onclick={event=>{event.preventDefault();togglePublicationMenu(event,{menuId});}}>•••</button>
  <div id={menuId} class="design-publication-menu design-situation-menu" popover="auto">
    <button disabled={busy} onclick={()=>changeReview=item}>View changes</button>
    <button disabled={busy} onclick={()=>playTest(item.proposed)}>Preview proposed</button>
    <button disabled={busy} onclick={()=>playTest(item.original)}>Preview published</button>
    <button disabled={busy || item.stale} onclick={()=>action({action:'review_change',proposalId:item.id,resolution:'approve'},'Update published.')}>Approve</button>
    <button class="design-menu-danger" disabled={busy} onclick={()=>action({action:'review_change',proposalId:item.id,resolution:'reject'},'Update rejected.')}>Reject</button>
  </div>
{/snippet}

<svelte:window onpointerdown={event=>{
  const picker=document.querySelector('#designWorkspace .design-library-switcher[open]');
  if(picker && !picker.contains(event.target))picker.open=false;
}} onclick={event=>{const menu=event.target.closest?.('.design-situation-menu');if(menu && event.target.closest('button,a'))menu.hidePopover();}} onkeydown={event=>{
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
      {#if listing && library.type === 'region' && !library.canDesign && !isAdmin}
        <div class="design-access-note">
          <strong>Regional Designer access required</strong>
          <p>You can browse this regional library. Adding situations from team libraries, publishing, and editing require Designer access assigned specifically to this region. Organization-level access does not automatically grant regional design access.</p>
        </div>
      {/if}
    {/if}
  </aside>
  <PageHeader title={sections.find(section=>section.value===view)?.label || 'Design'}
    context={view==='library'?'Create and organize situations for this library.':view==='submissions'?'Track situations and updates submitted for review.':view==='reviews'?'Review proposed situations and publication updates.':view==='manage'?'Manage library content and transfers.':view==='cherry-pick'?'Choose situations to publish into this library.':'Import situations into this library.'}>
    {#snippet actions()}
      {#if library?.canDesign && view === 'library'}<a class="dd-button" data-variant="primary" data-sveltekit-reload href={editLink()}>+ New situation</a>{/if}
      <Button variant="secondary" disabled={busy || loading} onclick={() => loadLibrary()} aria-label="Refresh design workspace"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16 M16 16h5v5" stroke-linecap="round" stroke-linejoin="round"/></svg></Button>
    {/snippet}
  </PageHeader>
  <div class="design-notification" hidden={!status}>
    <Feedback message={status} tone={statusTone} />
    {#if status}<button type="button" class="design-notification-close" aria-label="Dismiss notification" onclick={clearStatus}>×</button>{/if}
  </div>
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
                {#if selectedOwnedSituations.length}<button disabled={busy} onclick={archiveSelectedSituations}>Remove selected ({selectedOwnedSituations.length})</button>{/if}
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
                      <td><h3><button class="situation-title" aria-haspopup="dialog" onclick={() => openDetails(entry)}>{qualifiedSituationLabel(entry)}</button></h3><small>{libraryCardModel(entry).placement} · {libraryCardModel(entry).fieldingMethod}</small>
                      </td><td>{entry.difficulty?displayLabel(entry.difficulty):'—'}</td>
                      <td>{sourceName(entry)}</td><td>{entry.revision}</td>
                      <td>{entry.sourceType ? (entry.hiddenScope ? (entry.hiddenScope === library.type ? 'Hidden here' : 'Hidden by ' + (entry.hiddenScope === 'organization' ? 'organization' : 'region')) : entry.difficultyFiltered ? 'Outside team difficulty' : 'Inherited')
                        : library.type === 'team' ? 'In free play' : 'Published here'}
                      </td>
                      <td><div class="actions row-actions">
                        {#if entry.sourceType || library.canDesign}
                          {@const menuId='situation-actions-'+encodeURIComponent(entryId(entry))}
                          <button class="design-menu-trigger" type="button" aria-label={'Actions for '+entry.title} aria-haspopup="true" popovertarget={menuId} onclick={event=>{event.preventDefault();togglePublicationMenu(event,{menuId});}}>•••</button>
                          <div id={menuId} class="design-publication-menu design-situation-menu" popover="auto">
                            {@render situationActions(entry, true)}
                          </div>
                        {:else}
                          {@render situationActions(entry)}
                        {/if}
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
      {#if !review && !changeReview && !historicalReview}
      <section class="design-review-queue" aria-label="Publication reviews">
        <p class="design-review-context">Pending reviews for <strong>{library.name}</strong></p>
        <div class="admin-access-table-wrap"><table class="design-review-table" aria-label="Pending publication reviews"><thead><tr><th scope="col">Situation</th><th scope="col">Source</th><th scope="col">Type</th><th scope="col">Revision</th><th scope="col">Actions</th></tr></thead><tbody>
        {#each listing.changeReviews.filter(item => item.canReview && item.status === 'pending') as item}
          <tr><td><button class="situation-title" onclick={() => changeReview=item}>{qualifiedSituationLabel(item.original)}</button></td><td>—</td><td>Proposed update</td><td>{item.revision}</td><td>{@render proposalMenu(item)}</td></tr>
        {/each}
        {#if library.type==='global' && isAdmin}{#each historical as item (item.id)}
          <tr><td><button class="situation-title" onclick={()=>openHistoricalReview(item)}>{qualifiedSituationLabel(item.situation)}</button></td><td>{item.submitterName}</td><td>{item.submissionType==='create'?'New situation':'Update'}</td><td>—</td><td><button onclick={()=>openHistoricalReview(item)}>Review proposal</button></td></tr>
        {/each}{/if}
        {#each listing.incoming as item}
          <tr><td><button class="situation-title" onclick={()=>startReview(item)}>{item.incoming?qualifiedSituationLabel({...item.incoming,key:item.source_key}):item.source_key+' · '+item.sourceTitle}</button></td><td>{item.sourceLibraryName || '—'}</td><td>{item.stale?'Source changed':item.existing?'Publication update':'New publication'}</td><td>{item.source_revision}</td><td>{#if item.existing || item.stale}<button onclick={()=>startReview(item)}>Review changes</button>{:else}
            <button class="design-menu-trigger" aria-label={'Actions for '+item.sourceTitle} aria-haspopup="true" popovertarget={'publication-actions-'+item.id} onclick={event=>{event.preventDefault();togglePublicationMenu(event,item);}}>•••</button>
            <div id={'publication-actions-'+item.id} class="design-publication-menu" popover="auto">
              <button disabled={busy || !item.incoming} onclick={()=>{closePublicationMenu(item);playTest({...item.incoming,key:item.source_key,revision:item.source_revision});}}>Preview situation</button>
              <button disabled={busy} onclick={()=>{closePublicationMenu(item);void action({action:'approve',promotionId:item.id},'Revision approved and published.');}}>Approve and publish</button>
              <button class="design-menu-danger" disabled={busy} onclick={()=>{closePublicationMenu(item);void openRejection(item);}}>Reject</button>
            </div>
          {/if}</td></tr>
        {/each}
        {#if !listing.incoming.length && !listing.changeReviews.some(item=>item.canReview && item.status==='pending') && !(library.type==='global' && isAdmin && historical.length)}<tr><td colspan="5">No pending reviews for this library.</td></tr>{/if}
        </tbody></table></div>
      </section>
      {:else}<button class="design-review-back" onclick={()=>{review=null;changeReview=null;historicalReview=null;}}>← Back to publication reviews</button>{/if}
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
            <tr><td><button class="situation-title" disabled={busy} onclick={()=>playTestCandidate(candidate.entry)}>{qualifiedSituationLabel(candidate.entry)}</button></td><td>{candidate.group.path} · {scopeLabel[candidate.group.scope.type]}</td><td>{candidate.entry.difficulty?displayLabel(candidate.entry.difficulty):'—'}</td><td>{candidate.entry.revision}</td><td><div class="actions row-actions"><button disabled={busy} onclick={()=>playTestCandidate(candidate.entry)}>Preview</button><button class="dd-button" data-variant="primary" disabled={busy} onclick={()=>cherryPick(candidate.entry)}>Add to library</button></div></td></tr>
          {:else}<tr><td colspan="5">No eligible situations match these filters.</td></tr>{/each}
        </tbody></table></div>
      </section>
    {:else if view === 'submissions'}
      <section aria-label="Submissions">
        <h2>Submissions</h2><label class="field candidate-search">Status<select bind:value={submissionStatus}><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="withdrawn">Withdrawn</option></select></label>
        {#if listing.canReview}
          <button onclick={() => selectSection('reviews')}>Incoming reviews{listing.incoming.length ? ' (' + listing.incoming.length + ')' : ''}</button>
        {/if}
        <div class="admin-access-table-wrap"><table aria-label="Sent submissions"><thead><tr><th scope="col">Situation</th><th scope="col">Destination</th><th scope="col">Type</th><th scope="col">Revision</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>
        {#each listing.changeReviews.filter(item=>item.submittedByYou && (!submissionStatus || item.status===submissionStatus)) as item}
          <tr><td>{qualifiedSituationLabel({...item.original,...item.proposed})}</td><td>{item.destinationName || scopeLabel[item.destination_scope] || '—'}</td><td>Proposed update</td><td>{item.revision}</td><td><span class="design-status" data-status={item.status}>{displayLabel(item.status)}</span></td><td>—</td></tr>
        {/each}
        {#each listing.outgoing.filter(item=>!submissionStatus || item.status===submissionStatus) as item}
          <tr><td>{item.sourceLabel || item.source_key+' · '+item.source_title}</td><td>{item.destination_name}</td><td>Publication</td><td>{item.source_revision}</td><td><span class="design-status" data-status={item.status}>{displayLabel(item.status)}</span></td><td>
            {#if item.canWithdraw}<button disabled={busy} onclick={() => {
              if(window.confirm('Withdraw this submission? You can submit this revision again.'))void action({action:'withdraw_submission',promotionId:item.id},'Submission withdrawn.');
            }}>Withdraw</button>{:else if item.status === 'rejected' && item.review_notes}<button onclick={() => openRejection(item, true)}>View explanation</button>{:else}—{/if}
          </td></tr>
        {/each}
        {#if !listing.outgoing.some(item=>!submissionStatus || item.status===submissionStatus) && !listing.changeReviews.some(item=>item.submittedByYou && (!submissionStatus || item.status===submissionStatus))}<tr><td colspan="6">No submissions match this view.</td></tr>{/if}
        </tbody></table></div>
      </section>
    {/if}
    {#if historicalReview}
      <section aria-label="Review legacy proposal">
        <h2>{qualifiedSituationLabel(historicalReview.situation)}</h2>
        <SituationSummary record={historicalReview.situation} /><p>{historicalReview.rationale}</p>
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
        <div class="proposal-comparison-heading"><h2>{qualifiedSituationLabel(changeReview.original)}</h2><div class="actions">{@render proposalMenu(changeReview,'-comparison')}<button onclick={()=>changeReview=null}>Close</button></div></div>
        <div class="comparison"><div><h3>Published</h3><SituationSummary record={changeReview.original} /></div><div><h3>Proposed</h3><SituationSummary record={{...changeReview.original,...changeReview.proposed}} /></div></div>
        <p>Published revision {changeReview.revision} compared with the proposed update. Only changed fields are shown.</p>
        {#if changeReview.stale}<p role="alert">The published revision changed after this draft started. A new proposal is needed before approval.</p>{/if}
        <div class="admin-access-table-wrap"><table class="proposal-changes-table" aria-label="Proposed changes"><thead><tr><th>What changed</th><th>Published</th><th>Proposed</th></tr></thead><tbody>
          {#each proposalChanges(changeReview) as change}<tr><th scope="row">{change.field}</th><td>{change.before}</td><td class="proposal-changed-value">{change.after}</td></tr>
          {:else}<tr><td colspan="3">No content changes found.</td></tr>{/each}
        </tbody></table></div>
      </section>
    {/if}
    {#if rejection}
      <dialog class="situation-detail dd-detail-panel" bind:this={rejectionDialog} aria-labelledby="rejection-title" onclose={() => rejection = null}>
        <div class="detail-heading"><h2 id="rejection-title">{rejection.readonly ? 'Rejection explanation' : 'Reject submission'}</h2><Button variant="ghost" disabled={busy} onclick={() => rejectionDialog.close()}>Close</Button></div>
        <p>{rejection.item.source_title || rejection.item.sourceTitle || rejection.item.incoming?.title || 'Submission'}</p>
        {#if rejection.readonly}
          <p style="white-space: pre-wrap">{rejectionNotes}</p>
        {:else}
          <label class="field">Explanation (optional)<textarea rows="4" maxlength="2000" bind:value={rejectionNotes} placeholder="Help the submitting staff understand why this submission was rejected."></textarea></label>
          <p>The submitting staff can view this explanation on the Submissions page.</p>
          <div class="actions"><button disabled={busy} onclick={() => rejectionDialog.close()}>Cancel</button><Button variant="danger" class="design-reject-primary" {busy} onclick={rejectSubmission}>Reject</Button></div>
          {#if statusTone === 'error' && status}<p role="alert">{status}</p>{/if}
        {/if}
      </dialog>
    {/if}
    {#if detail}
      <dialog class="situation-detail dd-detail-panel" bind:this={detailDialog} aria-labelledby="situation-detail-title"
        onclose={() => detail = null}>
        <div class="detail-heading">
          <h2 id="situation-detail-title">{qualifiedSituationLabel(detail.entry)}</h2>
          <Button variant="ghost" onclick={closeDetails}>Close</Button>
        </div>
        <SituationSummary record={detail.entry} />{#if detail.entry.desc}<p>{detail.entry.desc}</p>{/if}
        <dl>
          <div><dt>Source library</dt><dd>{sourceName(detail.entry)}</dd></div>
          <div><dt>Revision</dt><dd>{detail.entry.revision}</dd></div>
          {#if detail.entry.difficulty}<div><dt>Difficulty</dt><dd>{displayLabel(detail.entry.difficulty)}</dd></div>{/if}
          {#if categoriesOf(detail.entry).length}<div><dt>Categories</dt><dd>{categoriesOf(detail.entry).map(displayLabel).join(', ')}</dd></div>{/if}
        </dl>
        {#if status}<p role="alert">{status}</p>{/if}
      </dialog>
    {/if}
    {#if review}
      <section class="inset" aria-label="Review publication">
        <h2>{review.incoming?qualifiedSituationLabel({...review.incoming,key:review.source_key}):review.sourceTitle}</h2>{#if review.incoming}<SituationSummary record={review.incoming} />{/if}
        <dl class="design-review-metadata"><div><dt>Source library</dt><dd>{review.sourceLibraryName || '—'}</dd></div><div><dt>Destination</dt><dd>{library.type === 'global' ? scopeLabel.global : library.name + ' · ' + scopeLabel[library.type]}</dd></div><div><dt>Revision</dt><dd>{review.source_revision}</dd></div></dl>
        {#if review.incoming?.desc}<p class="design-review-description">{review.incoming.desc}</p>{/if}
        {#if review.stale}<p>The source revision or its scope changed. Review the latest revision before approving.</p>{/if}
        {#if review.existing}
          <div class="comparison">
            <details open><summary>Current · revision {review.existing.revision}</summary><SituationSummary record={review.existing} /><p>{review.existing.desc}</p><pre>{JSON.stringify(review.existing, null, 2)}</pre></details>
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
          <button disabled={busy} onclick={() => openRejection(review)}>Reject</button>
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
  .library-table .actions-column {width:5rem;}
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
  .workspace-toolbar .field :is(input,select) {box-sizing:border-box;width:100%;height:var(--workspace-control-height);}

  h2,h3,p {margin:0;}
  h2,h3 {font-size:1rem;}
  p {margin-top:.35rem;color:#435873;}
  .toolbar {display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;}
  section {background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-panel);padding:1rem;margin:.75rem 0;}
  section > h2 {margin:.5rem 0;}
  .primary {color:white!important;background:#082443!important;}
  label {display:grid;gap:.25rem;}
  select,input {padding:.45rem;border:1px solid #8b9fb8;border-radius:.4rem;max-width:100%;}
  .inset .actions {margin-top:.75rem;}
  .comparison {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr));gap:.75rem;margin:.75rem 0;}
  pre {height:14rem;overflow:auto;background:#f4f7fa;padding:.5rem;font-size:.78rem;}
</style>
