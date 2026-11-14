<script lang="ts">
  import '../styles/app.css';
  import favicon from '$lib/assets/diamond-defence-classic-favicon.png?no-inline';
  import touchIcon from '$lib/assets/diamond-defence-classic-touch.png';

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" type="image/png" sizes="32x32" href={favicon} data-diamond-defense-icon />
  <link rel="apple-touch-icon" sizes="180x180" href={touchIcon} />
</svelte:head>

{@render children()}
