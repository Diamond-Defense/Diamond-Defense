<script lang="ts">
  import { onMount } from 'svelte';
  import appIcon from '$lib/assets/diamond-defense-app-icon.png';
  import fieldImage from '$lib/assets/diamond-defense-dark-blue-neon-field.webp';
  import legacyDocument from '../../../index.html?raw';
  import { loadLegacyRuntime } from '$lib/legacy/loadRuntime';

  const body = legacyDocument.match(/<body>([\s\S]*)<\/body>/i)?.[1] ?? '';
  const markup = body.replace(
    'id="fieldImg"',
    `id="fieldImg" src="${fieldImage}"`,
  );

  let runtimeError = '';

  onMount(async () => {
    try {
      await loadLegacyRuntime();
    } catch (error) {
      runtimeError = error instanceof Error ? error.message : String(error);
      console.error(error);
    }
  });
</script>

<svelte:head>
  <title>Diamond Defense</title>
  <link rel="icon" href={appIcon} data-diamond-defense-icon />
  <meta
    name="description"
    content="Diamond Defense is a baseball situation simulator and interactive playbook trainer for players and coaches."
  />
</svelte:head>

{#if runtimeError}
  <div class="runtime-error" role="alert">{runtimeError}</div>
{/if}

{@html markup}

<style>
  .runtime-error {
    margin: 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid #fecaca;
    border-radius: 0.5rem;
    background: #fef2f2;
    color: #991b1b;
    font-weight: 700;
  }
</style>
