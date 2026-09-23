<script lang="ts">
  import { onMount } from 'svelte';
  import brandLogo from '$lib/assets/diamond-defence-logo.png';
  import appIcon from '$lib/assets/diamond-defence-dd.svg';
  import softFieldImage from '$lib/assets/diamond-defense-soft-field.png';
  import legacyDocument from '../../../index.html?raw';
  import { loadLegacyRuntime } from '$lib/legacy/loadRuntime';

  const body = legacyDocument.match(/<body>([\s\S]*)<\/body>/i)?.[1] ?? '';
  const markup = body.replaceAll('data-diamond-defense-logo', `data-diamond-defense-logo src="${brandLogo}"`).replace(
    'id="fieldImg"',
    `id="fieldImg" src="${softFieldImage}"`,
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
  <title>Diamond Defence</title>
  <link rel="icon" href={appIcon} data-diamond-defense-icon />
  <meta
    name="description"
    content="Diamond Defence is a baseball situation simulator and interactive playbook trainer for players and coaches."
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
    border: 1px solid var(--error);
    border-radius: 0.5rem;
    background: var(--error-muted);
    color: var(--error);
    font-weight: 700;
  }
</style>
