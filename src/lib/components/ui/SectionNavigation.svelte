<script lang="ts">
  export interface SectionItem {
    value: string;
    label: string;
    disabled?: boolean;
    count?: number;
  }
  let { id, label, items, value, onchange, secondary = false }: {
    id?: string;
    label: string;
    items: SectionItem[];
    value: string;
    onchange: (value: string) => void;
    secondary?: boolean;
  } = $props();
</script>

<!-- Section buttons retain native tab order. They are not ARIA tabs: some
     sections contain tools with their own independent content and lifecycle. -->
<nav {id} class="workspace-nav dd-section-navigation" class:workspace-nav-subsections={secondary}
  aria-label={label} data-secondary={secondary}>
  {#each items as item (item.value)}
    <button type="button" aria-pressed={value === item.value} disabled={item.disabled}
      onclick={() => onchange(item.value)}>
      {item.label}{#if item.count} ({item.count}){/if}
    </button>
  {/each}
</nav>
