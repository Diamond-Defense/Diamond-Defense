<script>
 import {onMount} from 'svelte';
 import {occupancyLabel,ballLabel} from '$lib/plays/library.js';
 import {BALL_LOCATIONS} from '$lib/domain/situation-identity';
 import {TEACHING_CATEGORIES} from '$lib/domain/situation-metadata';
 let {onclose,onaction}= $props();
 let dialog;
 let q=$state(''),type=$state(''),runners=$state(''),outs=$state(''),ball=$state(''),location=$state(''),concept=$state(''),sort=$state('updated'),offset=$state(0);
 let items=$state([]),total=$state(0),loading=$state(true),busy=$state(false),message=$state(''),copying=$state(null),copyName=$state('');
 const activeFilters=$derived([runners,outs,ball,location,concept].filter(Boolean).length);
 const limit=20;
 $effect(()=>{
  const search=new URLSearchParams({q,type,runners,outs,ball,location,concept,sort,offset:String(offset),limit:String(limit)});
  const controller=new AbortController();loading=true;
  const timer=setTimeout(async()=>{try{
   const response=await fetch(`/api/play-library?${search}`,{signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.message||data.error||'Unable to load library.');
   items=data.items;total=data.total;message='';
  }catch(e){if(e.name!=='AbortError')message=e.message;}finally{if(!controller.signal.aborted)loading=false;}},200);
  return()=>{clearTimeout(timer);controller.abort();};
 });
 function resetPage(){offset=0;copying=null;}
 function clear(){q='';type='';runners='';outs='';ball='';location='';concept='';offset=0;}
 async function action(item,kind,name){busy=true;message='';try{const close=await onaction(item,kind,name);if(close)dialog.close();else{copying=null;offset=0; // trigger a fresh query even if filters have not changed
 const response=await fetch(`/api/play-library?${new URLSearchParams({q,type,runners,outs,ball,location,concept,sort,limit:String(limit)})}`);const value=await response.json();if(!response.ok)throw new Error(value.error||value.message||'Unable to refresh library.');items=value.items;total=value.total;
 }}catch(e){message=e.message;}finally{busy=false;}}
 onMount(()=>{dialog.showModal();return()=>{if(dialog.open)dialog.close();};});
</script>
<dialog bind:this={dialog} onclose={onclose} oncancel={event=>{if(busy)event.preventDefault();}} aria-labelledby="play-library-title">
 <header><div><h2 id="play-library-title">Board &amp; Situation Library</h2><p>Your private Boards and shared Situations.</p></div><div class="header-actions"><button class="new-board" disabled={busy} onclick={()=>action(null,'new')}>New Board</button><button disabled={busy} onclick={()=>dialog.close()}>Close Library</button></div></header>
 <div class="library-filters">
 <div class="primary-filters" inert={busy}>
  <label class="search">Search plays <input type="search" bind:value={q} oninput={resetPage} placeholder="Name, description, concept or location" maxlength="120" /></label>
  <label>Content type <select bind:value={type} onchange={resetPage}><option value="">Boards &amp; Situations</option><option value="board">Boards</option><option value="situation">Situations</option></select></label>
  <label>Sort plays <select bind:value={sort} onchange={resetPage}><option value="updated">Recently updated</option><option value="created">Recently created</option><option value="title">Name</option></select></label>
  <button onclick={clear}>Clear Filters</button>
 </div>
 <details inert={busy}><summary>Baseball filters{activeFilters?` · ${activeFilters} active`: ''}</summary><div class="filters">
  <label>Runners <select bind:value={runners} onchange={resetPage}><option value="">Any runners</option>{#each Array.from({length:8},(_,i)=>i) as mask}<option value={String(mask)}>{occupancyLabel(mask)}</option>{/each}</select></label>
  <label>Outs <select bind:value={outs} onchange={resetPage}><option value="">Any outs</option>{#each [0,1,2] as count}<option value={String(count)}>{count}</option>{/each}</select></label>
  <label>Batted ball <select bind:value={ball} onchange={resetPage}><option value="">Any batted ball</option>{#each ['ground_ball','line_drive','air_ball'] as value}<option value={value}>{ballLabel(value)}</option>{/each}</select></label>
  <label>Situation location <select bind:value={location} onchange={resetPage}><option value="">Any location</option>{#each BALL_LOCATIONS as value}<option value={value}>{value}</option>{/each}</select></label>
  <label>Situation concept <select bind:value={concept} onchange={resetPage}><option value="">Any concept</option>{#each TEACHING_CATEGORIES as category}<option value={category.id}>{category.label}</option>{/each}</select></label>
 </div></details>
 </div>
 <p role="status" aria-live="polite">{message|| (loading?'Loading plays…':`${total} ${total===1?'play':'plays'}`)}</p>
 <section aria-label="Library results" aria-busy={loading} inert={busy||loading}>
 {#each items as item (`${item.type}:${item.id}`)}
 <article data-content-id={item.id} aria-label={`${item.type==='board'?'Board':'Situation'}: ${item.title}`}>
  <button class="playbook-situation-card card-open" aria-label={`Present ${item.title}`} aria-describedby={`summary-${item.type}-${item.id}`} onclick={()=>action(item,'present')}>
   <span class="playbook-card-heading"><strong title={item.title}>{item.type==='situation'?item.title.replace(/ — (?:Bases Empty|Bases Loaded|Runners? on .*)$/,''):item.title}</strong><span class="type">{item.type==='board'?'Board':'Situation'}</span></span>
   <span class="playbook-card-state" aria-hidden="true">
    <span class="playbook-state-group"><span class="playbook-state-label">Runners</span><span class="training-base-map">{#each ['first','second','third'] as base,index}<i data-marker={base} class:is-occupied={!!(item.runners&(1<<index))}></i>{/each}</span></span>
    <span class="playbook-state-group"><span class="playbook-state-label">Outs</span><span class="training-out-map">{#each [0,1] as index}<i class:is-recorded={index<Number(item.outs)}></i>{/each}</span></span>
   </span>
   <span class="sr-only" id={`summary-${item.type}-${item.id}`}>{item.type==='board'?'Board':'Situation'}, {occupancyLabel(item.runners)}, {item.outs??0} outs, {ballLabel(item.ballType)}.</span>
   {#if item.description}<span class="playbook-card-description">{item.description}</span>{/if}
   <span class="sr-only">Open Presentation</span>
  </button>
  {#if copying===`${item.type}:${item.id}`}
   <form onsubmit={event=>{event.preventDefault();action(item,'duplicate',copyName);}}><label>Copy name <input bind:value={copyName} required maxlength="120" /></label><div class="actions"><button type="submit">Open Copy</button><button type="button" onclick={()=>copying=null}>Cancel Copy</button></div><p class="hint">Opens a separate unsaved draft. Save or publish when ready.</p></form>
  {:else}
   <div class="actions"><button onclick={()=>action(item,'edit')}>Edit</button><button class="duplicate" onclick={()=>{copying=`${item.type}:${item.id}`;copyName=`${item.title.slice(0,110)} copy`;}}>Duplicate</button></div>
  {/if}
 </article>
 {:else}
 {#if !loading&&!message}<div class="empty"><h3>{q||type||runners||outs||ball||location||concept?(type==='board'&&!q&&!runners&&!outs&&!ball&&!location&&!concept?'No saved Boards yet':'No matching plays'):'No saved plays yet'}</h3><p>{q||type||runners||outs||ball||location||concept?'Try a broader search or clear the filters.':'Create a Board to start your collection.'}</p></div>{/if}
 {/each}
 </section>
 <footer><button disabled={busy||loading||offset===0} onclick={()=>{offset=Math.max(0,offset-limit);copying=null;}}>Previous Page</button><span>{total?`${offset+1}–${Math.min(offset+limit,total)} of ${total}`:'0 plays'}</span><button disabled={busy||loading||offset+limit>=total} onclick={()=>{offset+=limit;copying=null;}}>Next Page</button></footer>
</dialog>
<style>
 dialog{color:var(--text-primary);background:var(--surface-raised);border:1px solid var(--border);border-radius:var(--radius-panel,12px);box-shadow:var(--shadow-raised);width:min(1120px,calc(100vw - 32px));height:min(820px,calc(100dvh - 32px));max-height:calc(100dvh - 32px);box-sizing:border-box;padding:0;overflow:hidden}
 dialog[open]{display:flex;flex-direction:column}dialog::backdrop{background:var(--overlay)}header{display:flex;justify-content:space-between;gap:16px;align-items:start}h2,h3,p{margin:0}header p,.hint{color:var(--text-secondary)}header{margin:0;padding:16px 20px;background:transparent;border-bottom:1px solid var(--border);flex:none}h2{font-size:var(--type-page);font-weight:var(--weight-heading);margin:3px 0 2px}header p{font-size:13px;line-height:1.5;color:var(--text-muted)}.library-filters{padding:16px 22px 10px;flex:none;max-height:40dvh;overflow:auto}header button{flex:none}button{min-height:44px}input,select{width:100%;min-height:44px;box-sizing:border-box;background:var(--surface);color:var(--text-primary);border:1px solid var(--border-emphasis);border-radius:var(--radius-control);padding:8px;font:inherit}label{display:grid;gap:5px;min-width:0;color:var(--text-secondary);font-size:12px;font-weight:700}label input,label select{font-size:14px;font-weight:400}.filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.primary-filters{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) auto;align-items:end;gap:12px}details{margin-top:12px}summary{color:var(--text-secondary);border-top:1px solid var(--border);padding-top:10px;cursor:pointer;min-height:44px;display:list-item;align-content:center;font-weight:700}details .filters{padding:8px 0}.hint{font-size:13px;margin:12px 0}section{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px;align-items:stretch;align-content:start;grid-auto-rows:max-content;min-height:0;flex:1 1 auto;overflow:auto;overscroll-behavior:contain;padding:0 22px 22px}article{min-width:0;border:1px solid var(--border);border-radius:13px;background:var(--surface);display:flex;flex-direction:column;overflow:hidden}.card-open{width:100%;border:0;border-radius:0;background:transparent;padding:12px 14px;gap:7px;flex:1}.card-open:hover{background:var(--surface-hover)}.card-open .playbook-card-heading{width:100%}.card-open .playbook-card-heading{flex-wrap:wrap;justify-content:flex-start}.card-open strong{flex:1 0 100%;white-space:normal;overflow-wrap:anywhere;line-height:1.3}.card-open .type{font-size:11px}.card-open .playbook-card-description{display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.card-open .playbook-card-state{width:100%}article .actions{padding:0 14px 12px;display:grid;grid-template-columns:1fr 1fr}article form{padding:0 14px 12px}.header-actions{display:flex;gap:8px}.new-board{background:var(--accent-primary);color:var(--text-on-accent)}.duplicate{color:var(--text-secondary)}h3{font-size:18px;overflow-wrap:anywhere}.type{font-size:12px;font-weight:700;border:1px solid var(--border-emphasis);border-radius:4px;padding:3px 6px;flex:none}.actions{display:flex;gap:8px;flex-wrap:wrap}form{display:grid;gap:8px}footer{padding:12px 22px;border-top:1px solid var(--border);flex:none;display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:0}.empty{grid-column:1/-1;padding:24px;text-align:center;display:grid;gap:12px}[role=status]{flex:none;min-height:24px;padding:0 22px 12px;margin:0;font-size:13px;font-weight:600;color:var(--text-secondary);white-space:pre-line}
 article .actions button{font-size:13px;padding:6px 10px;min-height:40px}
 @media(max-width:1100px){section{grid-template-columns:repeat(3,minmax(0,1fr))}}
 @media(max-width:900px){section{grid-template-columns:repeat(2,minmax(0,1fr))}}
 @media(max-width:650px){dialog{width:calc(100vw - 16px);max-height:calc(100dvh - 16px);padding:0}.library-filters{padding:12px 14px}header{padding:16px 14px}section{padding:0 14px 14px}[role=status]{padding-left:14px;padding-right:14px}.filters,.primary-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.primary-filters .search,.primary-filters>button{grid-column:1/-1}section{grid-template-columns:minmax(0,1fr)}header{flex-wrap:wrap}h2{font-size:20px}.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.actions button{white-space:normal;font-size:14px;padding:8px}footer{flex-wrap:wrap}}
</style>
