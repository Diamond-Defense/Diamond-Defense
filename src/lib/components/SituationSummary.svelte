<script>
  import {libraryCardModel,renderLibraryCardContent,disconnectLibraryCard} from '$lib/plays/library-card.js';
  let {record,showCategory=true} = $props();
  let host = $state();
  $effect(() => {
    if (!host || !record) return;
    renderLibraryCardContent(host,libraryCardModel(record),{summary:true,showCategory});
    return () => disconnectLibraryCard(host);
  });
</script>
<div class="situation-summary" bind:this={host}></div>
