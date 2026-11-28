<script>
 import {onMount} from 'svelte';
 let {beforecreate=()=>true,disabled=false}= $props();
 let scopes=$state([]),open=$state(false);
 onMount(()=>{
  const controller=new AbortController();
  void fetch('/api/design',{signal:controller.signal}).then(async response=>{
   if(!response.ok)return;
   const result=await response.json();
   if(!controller.signal.aborted)scopes=(result.workspaces||[]).filter(scope=>scope.canDesign);
  }).catch(()=>{});
  return()=>controller.abort();
 });
 function create(scope){
  if(!beforecreate(scope))return;
  open=false;
  window.location.assign('/coach-board?'+new URLSearchParams({design:scope.type,id:scope.id}));
 }
</script>
<svelte:window onpointerdown={event=>{if(!event.target.closest?.('.new-situation-action'))open=false;}} onkeydown={event=>{if(event.key==='Escape'&&open){open=false;event.preventDefault();event.stopPropagation();}}} />
{#if scopes.length}
 <div class="new-situation-action">
  <button class="dd-button" data-variant="primary" type="button" {disabled} aria-expanded={scopes.length>1?open:undefined} onclick={()=>scopes.length===1?create(scopes[0]):open=!open}>New Situation</button>
  {#if open}<div class="creation-options" role="group" aria-label="Choose situation library"><p>Create in</p>{#each scopes as scope}<button class="dd-button" data-variant="ghost" type="button" {disabled} onclick={()=>create(scope)}>{scope.name}<small>{scope.type==='global'?'Global Library':scope.type==='team'?'Team Situation Library':scope.type==='region'?'Regional Library':'Organization Library'}</small></button>{/each}</div>{/if}
 </div>
{/if}
<style>
 .new-situation-action{position:relative;display:flex;flex:none}
 .creation-options{position:absolute;right:0;top:calc(100% + 8px);z-index:10;box-sizing:border-box;min-width:240px;max-width:calc(100vw - 64px);max-height:280px;overflow:auto;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-control);box-shadow:var(--shadow-raised)}
 .creation-options p{margin:4px 8px 8px;font-size:12px;color:var(--text-secondary)}
 .creation-options button{width:100%;display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;white-space:normal}
 .creation-options small{font-size:11px;color:var(--text-secondary)}
</style>
