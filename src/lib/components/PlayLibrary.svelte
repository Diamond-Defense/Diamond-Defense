<script>
 import {libraryCardModel,renderLibraryCardContent,disconnectLibraryCard} from '$lib/plays/library-card.js';
 import {MAX_BOARD_FILE_BYTES} from '$lib/plays/board-transfer.js';
 import NewSituationAction from './NewSituationAction.svelte';
 import {onMount,tick} from 'svelte';
 import {occupancyLabel,ballLabel} from '$lib/plays/library.js';
 import {BALL_LOCATIONS} from '$lib/domain/situation-identity';
 import {TEACHING_CATEGORIES} from '$lib/domain/situation-metadata';
 import {LIBRARY_PAGE_SIZE,filterLibraryItems,sortLibraryItems} from '$lib/plays/library-browser.js';
 let {onclose,onaction,onimport=()=>false,onnewSituation=()=>true,mode='management',catalog=[],sourceLoading=false,sourceError='',onretry=()=>{},currentKey='',open=true,allowCreate=true,stateKey='management'}= $props();
 const playbook=$derived(mode==='playbook');
 let dialog=$state(),importInput=$state(),results=$state();
 let ready=$state(false),reload=$state(0),scrollTop=$state(0);
 let restoreScroll=true;
 let q=$state(''),type=$state(''),runners=$state(''),outs=$state(''),ball=$state(''),location=$state(''),concept=$state(''),sort=$state('starting'),difficulty=$state(''),outcome=$state(''),filtersOpen=$state(false),visibleCount=$state(20);
 let items=$state([]),total=$state(0),loading=$state(true),busy=$state(false),message=$state(''),copying=$state(null),copyName=$state('');
 const activeFilters=$derived([runners,outs,ball,location,outcome,type,sort==='starting'?'':sort].filter(Boolean).length);
 const limit=LIBRARY_PAGE_SIZE;
 const filters=$derived({q,type:playbook?'':type,runners,outs,ball,location,concept,difficulty,outcome});
 const matching=$derived(playbook?sortLibraryItems(filterLibraryItems(catalog.map(record=>libraryCardModel(record,'situation',{current:record.key===currentKey})),filters),sort):[]);
 const title=$derived(playbook?'Situation Library':'Board & Situation Library');
 const resultType=$derived(playbook||type==='situation'?'situations':type==='board'?'Boards':'Boards and Situations');
 const resultCount=$derived(resultType==='situations'?`${total} ${total===1?'situation':'situations'}`:resultType==='Boards'?`${total} ${total===1?'Board':'Boards'}`:`${total} ${total===1?'result':'results'} · Boards and Situations`);
 const hasSearchFilters=$derived(Boolean(q||runners||outs||ball||location||concept||difficulty||outcome));
 const emptyHeading=$derived(hasSearchFilters?`No matching ${resultType}`:`No ${resultType} available yet`);
 const emptyHint=$derived(hasSearchFilters?'Try a broader search or clear the filters.':playbook?'Situations will appear here when they are available in your library.':type==='situation'?(allowCreate?'Create a Situation to get started.':'Shared Situations will appear here when available.'):type==='board'?'Create or import a Board to get started.':allowCreate?'Create a Board or Situation, or import a Board to get started.':'Create or import a Board, or choose a shared Situation when available.');
 function persist(){if(ready)try{sessionStorage.setItem('diq-browser:'+stateKey,JSON.stringify({q,type,runners,outs,ball,location,concept,difficulty,outcome,sort,filtersOpen,visibleCount,scrollTop}));}catch{ /* Browsing remains available if storage is disabled or full. */ }}
 $effect(()=>{q;type;runners;outs;ball;location;concept;difficulty;outcome;sort;filtersOpen;visibleCount;scrollTop;persist();});
 let cachedQuery='',cachedItems=[];
 async function positionResults(){await tick();if(results&&restoreScroll){results.scrollTop=scrollTop;restoreScroll=false;}}
 function loadNearBottom(){
  if(!results||loading||message||!open)return;
  scrollTop=results.scrollTop;
  if(results.scrollHeight-results.scrollTop-results.clientHeight<300&&items.length<total)visibleCount+=limit;
 }
 $effect(()=>{
  if(!ready)return;
  const count=visibleCount;
  if(playbook){
   if(sourceLoading||sourceError){items=[];total=0;loading=sourceLoading;message=sourceError;return;}
   total=matching.length;
   items=matching.slice(0,count);loading=false;message='';void positionResults();return;
  }
  const query=new URLSearchParams({...filters,sort}).toString()+`&refresh=${reload}`;
  if(query!==cachedQuery){cachedQuery=query;cachedItems=[];items=[];total=0;}
  const controller=new AbortController();loading=true;
  const timer=setTimeout(async()=>{try{
   let available=cachedItems, resultTotal=Infinity;
   while(available.length<count&&available.length<resultTotal){
    const search=new URLSearchParams({...filters,sort,offset:String(available.length),limit:String(Math.min(limit,count-available.length))});
    const response=await fetch(`/api/play-library?${search}`,{signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.message||data.error||'Unable to load library.');
    if(controller.signal.aborted)return;
    resultTotal=data.total;
    available=[...available,...data.items];
    if(!data.items.length)break;
   }
   if(controller.signal.aborted)return;
   cachedItems=available;items=available;
   if(Number.isFinite(resultTotal))total=resultTotal;
   message='';void positionResults();
  }catch(e){if(e.name!=='AbortError')message=e.message;}finally{if(!controller.signal.aborted)loading=false;}},200);
  return()=>{clearTimeout(timer);controller.abort();};
 });
 $effect(()=>{if(!ready||!dialog)return;if(open&&!dialog.open){dialog.showModal();document.body.classList.add('library-browser-open');requestAnimationFrame(()=>dialog.querySelector('input[type=search]')?.focus());}else if(!open&&dialog.open)dialog.close();});
 function cardContent(node,item){renderLibraryCardContent(node,item);return {update(value){renderLibraryCardContent(node,value);},destroy(){disconnectLibraryCard(node);}};}
 function resetPage(){visibleCount=limit;copying=null;scrollTop=0;restoreScroll=true;}
 function clear(){q='';type='';runners='';outs='';ball='';location='';concept='';difficulty='';outcome='';sort='starting';resetPage();}
 async function action(item,kind,name){busy=true;message='';persist();try{const close=await onaction(item,kind,name);if(close)dialog.close();else{copying=null;reload++;}}catch(e){message=e.message;}finally{busy=false;}}
 function random(){if(matching.length)void action(matching[Math.floor(Math.random()*matching.length)],'select');}
 async function importFile(event){
  const input=event.currentTarget,file=input.files?.[0];if(!file)return;
  busy=true;message='';
  try{if(file.size>MAX_BOARD_FILE_BYTES)throw new Error('Board file must be smaller than 1 MB.');if(await onimport(await file.text()))dialog.close();}
  catch(error){message=error.message;}finally{busy=false;input.value='';}
 }
 onMount(()=>{
  try{const saved=JSON.parse(sessionStorage.getItem('diq-browser:'+stateKey)||'null');if(saved){
   q=typeof saved.q==='string'?saved.q.slice(0,120):'';
   type=['','board','situation'].includes(saved.type)?saved.type:'';
   runners=['','on','empty','0','1','2','3','4','5','6','7'].includes(saved.runners)?saved.runners:'';
   outs=['','0','1','2'].includes(saved.outs)?saved.outs:'';
   ball=['','ground_ball','line_drive','air_ball'].includes(saved.ball)?saved.ball:'';
   location=BALL_LOCATIONS.includes(saved.location)?saved.location:'';
   concept=TEACHING_CATEGORIES.some(item=>item.id===saved.concept)?saved.concept:'';
   difficulty=['','foundational','intermediate','advanced'].includes(saved.difficulty)?saved.difficulty:'';
   outcome=['','Singles','Extra-base hits','General'].includes(saved.outcome)?saved.outcome:'';
   sort=['starting','updated','created','title'].includes(saved.sort)?saved.sort:'starting';filtersOpen=!!saved.filtersOpen;
   visibleCount=Number.isSafeInteger(saved.visibleCount)&&saved.visibleCount>=limit?Math.min(saved.visibleCount,1000000):limit;
   scrollTop=Number.isFinite(saved.scrollTop)&&saved.scrollTop>=0?saved.scrollTop:0;
  }}catch{ /* Invalid saved view preferences fall back to defaults. */ }
  ready=true;
  return()=>{persist();if(dialog.open)dialog.close();if(!document.querySelector('dialog.shared-library-browser[open]'))document.body.classList.remove('library-browser-open');};
 });
</script>
<dialog class="shared-library-browser" id={playbook?'playbookBrowserOverlay':undefined} bind:this={dialog} onclose={()=>{if(!document.querySelector('dialog.shared-library-browser[open]'))document.body.classList.remove('library-browser-open');onclose();}} oncancel={event=>{if(busy)event.preventDefault();}} aria-labelledby={playbook?'playbookBrowserTitle':'play-library-title'}>
 <header><div><h2 id={playbook?'playbookBrowserTitle':'play-library-title'}>{title}</h2><p>{playbook?'Choose a situation, then select Start Situation to begin.':'Your private Boards and shared Situations.'}</p></div><div class="header-actions library-header-actions">{#if allowCreate}<NewSituationAction disabled={busy} beforecreate={onnewSituation} />{/if}{#if !playbook}<button class="dd-button" data-variant="secondary" disabled={busy} onclick={()=>action(null,'new')}>New Board</button><button class="dd-button" data-variant="secondary" disabled={busy} onclick={()=>importInput.click()}>Import Board</button><input bind:this={importInput} type="file" accept=".json,application/json" aria-label="Import Board JSON file" hidden onchange={importFile} />{/if}{#if playbook}<button id="playbookRandomFiltered" class="dd-button shuffle-button" data-variant="secondary" title="Choose a random situation from filtered results" aria-label="Choose a random situation from filtered results" disabled={loading||busy||!matching.length} onclick={random}><svg xmlns="http://www.w3.org/2000/svg" class="lucide lucide-shuffle" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 14 4 4-4 4" /><path d="m18 2 4 4-4 4" /><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" /><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" /><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" /></svg><span>Random</span></button>{/if}<button id={playbook?'playbookBrowserClose':undefined} class="dd-button" data-variant="ghost" disabled={busy} onclick={()=>dialog.close()}>Close</button></div></header>
 <div class="library-filters">
 <div class="primary-filters" inert={busy}>
  <label class="search">Search <input id={playbook?'playbookSearch':undefined} type="search" bind:value={q} oninput={resetPage} placeholder={playbook?'Search situations':'Search boards and situations'} maxlength="120" /></label>
  <label>Category <select id={playbook?'playbookCategory':undefined} bind:value={concept} onchange={resetPage}><option value="">All categories</option>{#each TEACHING_CATEGORIES as category}<option value={category.id}>{category.label}</option>{/each}</select></label>
  <label>Difficulty <select id={playbook?'playbookDifficulty':undefined} bind:value={difficulty} onchange={resetPage}><option value="">All difficulties</option><option value="foundational">Foundational</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
  <button id={playbook?'playbookMoreFilters':undefined} class="filter-toggle" aria-expanded={filtersOpen} aria-controls={playbook?'playbookExtraFilters':'board-library-extra-filters'} onclick={()=>filtersOpen=!filtersOpen}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6M15 14v6" /></svg> Filters <span id={playbook?'playbookMoreFilterCount':undefined}>{activeFilters?`· ${activeFilters} active`:''}</span></button>
  <button id={playbook?'playbookClearFilters':undefined} disabled={!q&&!concept&&!difficulty&&!activeFilters} onclick={clear}>Clear filters</button>
 </div>
 <div id={playbook?'playbookExtraFilters':'board-library-extra-filters'} class="extra-filters" hidden={!filtersOpen} inert={busy}>
 <div class="filters">
  <label>Hit outcome <select id={playbook?'playbookHitOutcome':undefined} bind:value={outcome} onchange={resetPage}><option value="">All outcomes</option><option value="Singles">Singles</option><option value="Extra-base hits">Extra-base hits</option><option value="General">General / Other</option></select></label>
  <label>Runners <select id={playbook?'playbookRunners':undefined} bind:value={runners} onchange={resetPage}><option value="">Any runners</option><option value="0">Bases empty</option><option value="on">Runners on</option>{#each [1,2,4,3,5,6,7] as mask}<option value={String(mask)}>{occupancyLabel(mask)}</option>{/each}</select></label>
  <label>Outs <select bind:value={outs} onchange={resetPage}><option value="">Any outs</option>{#each [0,1,2] as count}<option value={String(count)}>{count} {count===1?'out':'outs'}</option>{/each}</select></label>
  <label>Batted ball <select bind:value={ball} onchange={resetPage}><option value="">Any batted ball</option>{#each ['ground_ball','line_drive','air_ball'] as value}<option value={value}>{ballLabel(value)}</option>{/each}</select></label>
  <label>Ball location <select bind:value={location} onchange={resetPage}><option value="">Any location</option>{#each BALL_LOCATIONS as value}<option value={value}>{value}</option>{/each}</select></label>
  {#if !playbook}<label>Content type <select bind:value={type} onchange={resetPage}><option value="">Boards &amp; Situations</option><option value="board">Boards</option><option value="situation">Situations</option></select></label>{/if}
  <label>Sort <select bind:value={sort} onchange={resetPage}><option value="starting">Difficulty, runners &amp; outs</option><option value="updated">Recently updated</option><option value="created">Recently created</option><option value="title">Name</option></select></label>
 </div></div>
 </div>
 <div class="summary"><p id={playbook?'playbookResultCount':undefined} role="status" aria-live="polite">{message|| (loading&&!items.length?'Loading…':resultCount)}</p>{#if message}<button disabled={busy||loading} onclick={()=>playbook?onretry():reload++}>Retry</button>{/if}</div>
 <section id={playbook?'playbookBrowserList':undefined} bind:this={results} onscroll={loadNearBottom} aria-label="Library results" aria-busy={loading} inert={busy}>
 {#each items as item (`${item.type}:${item.id}`)}
 <article data-content-id={item.id} aria-label={`${item.type==='board'?'Board':'Situation'}: ${item.title}`}>
  <button class="playbook-situation-card card-open" class:is-current={item.current} aria-current={item.current?'true':undefined} data-situation-key={playbook?item.id:undefined} use:cardContent={item} aria-label={playbook?`Select ${[item.displayCode,item.cardTitle||item.title].filter(Boolean).join(' · ')}. ${occupancyLabel(item.runners)}, ${item.outs} ${item.outs===1?'out':'outs'}`:`Present ${item.cardTitle||item.title}${item.variationLabel?`, ${item.variationLabel}`:''}`}  onclick={()=>action(item,playbook?'select':'present')}>
  </button>
  {#if !playbook}
  {#if copying===`${item.type}:${item.id}`}
   <form onsubmit={event=>{event.preventDefault();action(item,'duplicate',copyName);}}><label>Copy name <input bind:value={copyName} required maxlength="120" /></label><div class="actions"><button type="submit">Open Copy</button><button type="button" onclick={()=>copying=null}>Cancel Copy</button></div><p class="hint">Opens a separate unsaved draft. Save or publish when ready.</p></form>
  {:else}
   <div class="actions card-actions"><button class="edit" onclick={()=>action(item,'edit')}>Edit</button><button class="duplicate" onclick={()=>{copying=`${item.type}:${item.id}`;copyName=`${item.title.slice(0,110)} copy`;}}>Duplicate</button></div>
  {/if}
  {/if}
 </article>
 {:else}
 {#if !loading&&!message}<div class="empty"><h3>{emptyHeading}</h3><p>{emptyHint}</p></div>{/if}
 {/each}
 {#if items.length&&items.length<total}<div class="load-status"><button disabled={loading||busy} onclick={()=>visibleCount+=limit}>{loading?'Loading more…':'Load more'}</button></div>{/if}
 </section>

</dialog>
<style>
 :global(body.library-browser-open){overflow:hidden}

 dialog{color:var(--text-primary);background:var(--app-background);border:1px solid var(--border);border-radius:var(--radius-panel,12px);box-shadow:var(--shadow-raised);width:min(1200px,calc(100vw - 32px));height:min(820px,calc(100dvh - 32px));max-height:calc(100dvh - 32px);box-sizing:border-box;padding:0;overflow:hidden}
 dialog[open]{display:flex;flex-direction:column}dialog::backdrop{background:var(--overlay)}header{display:flex;justify-content:space-between;gap:16px;align-items:start}h2,h3,p{margin:0}header p,.hint{color:var(--text-secondary)}header{margin:0;padding:16px 22px;background:var(--surface);border-bottom:1px solid var(--border);flex:none}h2{font-size:var(--type-page);font-weight:var(--weight-heading);margin:3px 0 2px}header p{font-size:13px;line-height:1.5;color:var(--text-muted)}.library-filters{padding:16px 22px 10px;flex:none}header button{flex:none}button{min-height:44px}input,select{width:100%;min-height:44px;box-sizing:border-box;background:var(--surface);color:var(--text-primary);border:1px solid var(--border-emphasis);border-radius:var(--radius-control);padding:8px;font:inherit}label{display:grid;gap:5px;min-width:0;color:var(--text-secondary);font-size:12px;font-weight:700}label input,label select{font-size:14px;font-weight:400}.filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.primary-filters{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr) auto auto;align-items:end;gap:12px}.extra-filters{margin-top:16px;padding:0;border:0;border-radius:0;background:transparent}.extra-filters[hidden]{display:none}.filter-toggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}.hint{font-size:13px;margin:12px 0}section{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px;align-items:stretch;align-content:start;grid-auto-rows:max-content;min-height:0;flex:1 1 auto;overflow:auto;overscroll-behavior:contain;padding:0 22px 22px}article{min-width:0;border:1px solid var(--border);border-radius:13px;background:var(--surface);display:flex;flex-direction:column;overflow:hidden}.card-open{width:100%;border:0;border-radius:0;background:transparent;padding:12px 14px;gap:7px;flex:1}article .actions{padding:10px 14px;display:grid;grid-template-columns:1fr 1fr}article form{padding:0 14px 12px}.header-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.duplicate{color:var(--text-secondary)}h3{font-size:18px;overflow-wrap:anywhere}.actions{display:flex;gap:8px;flex-wrap:wrap}form{display:grid;gap:8px}.load-status{grid-column:1/-1;text-align:center;padding:8px}.card-actions{background:color-mix(in srgb,var(--surface-hover) 35%,var(--surface));border-top:1px solid var(--border)}.card-actions .edit{border:1px solid var(--border-emphasis);background:var(--surface);color:var(--text-primary);font-weight:600}.card-actions .duplicate{background:var(--surface);border:1px solid var(--border-emphasis);color:var(--text-secondary);font-weight:500}.card-actions .duplicate:hover{background:var(--surface-hover);border-color:var(--text-secondary);color:var(--text-primary)}.empty{grid-column:1/-1;padding:24px;text-align:center;display:grid;gap:12px}[role=status]{flex:none;min-height:24px;padding:0 22px 12px;margin:0;font-size:13px;font-weight:600;color:var(--text-secondary);white-space:pre-line}
 /* Explicit heights keep native select controls aligned with the search field. */
 .library-filters label{gap:4px;font-size:12px;line-height:18px;font-weight:600}
 .library-filters :is(input,select,button){box-sizing:border-box;height:40px!important;min-height:40px!important;padding:8px 12px!important;font-family:inherit;font-size:14px;line-height:22px}
 .library-filters button{font-size:13px;font-weight:500;white-space:nowrap}
 .shuffle-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:40px;padding:8px 12px;flex:none}
 .summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 22px 12px;flex:none}.summary [role=status]{padding:0}.summary button{font-size:13px;background:transparent;border-color:transparent;color:var(--text-secondary)}
 /* Coordinate the body and footer without using the green current-state tint. */
 article:has(:focus-visible)>.card-open:not(.is-current){background:color-mix(in srgb,var(--surface-hover) 60%,var(--surface))}
 article:has(:focus-visible)>.card-actions{background:color-mix(in srgb,var(--surface-hover) 80%,var(--surface))}
 @media(hover:hover) and (pointer:fine){
  article:hover>.card-open:not(.is-current){background:color-mix(in srgb,var(--surface-hover) 60%,var(--surface))}
  article:hover>.card-actions{background:color-mix(in srgb,var(--surface-hover) 80%,var(--surface))}
 }
 .card-actions .edit:hover{background:var(--surface-hover);border-color:var(--text-secondary)}
 .card-open.is-current{background:var(--selection-background)}
 article .actions button{font-size:13px;padding:6px 10px;min-height:40px}
 @media(max-width:1100px){section{grid-template-columns:repeat(3,minmax(0,1fr))}}
 @media(max-width:900px){.primary-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.primary-filters .search{grid-column:1/-1}.filters{grid-template-columns:repeat(2,minmax(0,1fr))}section{grid-template-columns:repeat(2,minmax(0,1fr))}}
 @media(max-width:650px){dialog{width:calc(100vw - 16px);max-height:calc(100dvh - 16px);padding:0}.library-filters{padding:12px 14px}header{padding:16px 14px}section{padding:0 14px 14px}[role=status]{padding-left:14px;padding-right:14px}.filters,.primary-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.primary-filters .search{grid-column:1/-1}.summary{padding-inline:14px}section{grid-template-columns:minmax(0,1fr)}header{flex-wrap:wrap}h2{font-size:20px}.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.actions button{white-space:normal;font-size:14px;padding:8px}}
</style>
