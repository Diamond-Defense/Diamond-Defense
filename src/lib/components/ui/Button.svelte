<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Props = HTMLButtonAttributes & {
    children: Snippet;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    busy?: boolean;
  };
  let { children, variant = 'secondary', busy = false, disabled = false,
    class: className = '', type = 'button', ...attributes }: Props = $props();
</script>

<button {...attributes} {type} class="dd-button {className}" data-variant={variant}
  disabled={disabled || busy} aria-busy={busy || undefined}>
  {@render children()}
</button>
