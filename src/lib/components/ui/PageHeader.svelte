<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, context = '', actions, class: className = '' }: {
    title: string;
    context?: string;
    actions?: Snippet;
    class?: string;
  } = $props();
</script>

<div class="dd-page-header {className}">
  <div class="dd-page-header-copy">
    <h1>{title}</h1>
    {#if context}<p>{context}</p>{/if}
  </div>
  {#if actions}<div class="dd-page-header-actions">{@render actions()}</div>{/if}
</div>
