<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  let { children, padded = true, class: className = '', ...attributes }: HTMLAttributes<HTMLDivElement> & {
    children: Snippet;
    padded?: boolean;
  } = $props();
</script>

<div {...attributes} class="dd-panel {className}" data-padded={padded}>
  {@render children()}
</div>
