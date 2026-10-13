<!-- src/routes/connections/+page.svelte -->
<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import type { createSvelteKitClient } from '@techinject/sveltekit';
  import { mountConnectionsDashboard } from '@techinject/browser/dashboard';

  // The root layout provides setContext('signals', client).
  const client = getContext<ReturnType<typeof createSvelteKitClient>>('signals');
  let container: HTMLDivElement;
  onMount(() => {
    // Idempotent; also handles the child mounting before its root layout.
    const signals = client.mount();
    return mountConnectionsDashboard(container, signals);
    // Root layout owns client.dispose(); this page only unmounts the view.
  });
</script>
<svelte:head>
  <title>Connections</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>
<h1>Connections</h1>
<div bind:this={container}></div>
