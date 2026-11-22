<script lang="ts">
  import type { Snippet } from 'svelte';
  let { label, controlId, children, hint = '', error = '', class: className = '' }: {
    label: string;
    controlId: string;
    children: Snippet;
    hint?: string;
    error?: string;
    class?: string;
  } = $props();
</script>

<div class="dd-field {className}">
  <label for={controlId}>{label}</label>
  {@render children()}
  {#if hint}<p class="dd-field-hint" id="{controlId}-hint">{hint}</p>{/if}
  {#if error}<p class="dd-field-error" id="{controlId}-error">{error}</p>{/if}
</div>
