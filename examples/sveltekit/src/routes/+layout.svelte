<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { createSvelteKitClient } from '@techinject/sveltekit';
  import type { SignalEvent, RequestRecord } from '@techinject/contracts';
  let { children } = $props();
  let events = $state<(SignalEvent | RequestRecord)[]>([]);
  let mounted = $state(false);
  const client = createSvelteKitClient({
    consent: { analytics: false, marketing: false, observability: false },
    providers: [{ name: 'local', category: 'analytics', send(event) { events = [...events, event]; } }],
    observer: { record(record) { events = [...events, record]; } },
  });
  setContext('signals', client);
  onMount(() => { client.mount(); mounted = true; return () => client.dispose(); });
  async function allow() {
    const signals = client.getSignals();
    signals.setConsent({ analytics: true, marketing: false, observability: true });
    await signals.page(); // Explicit current page after consent; denied pages never replay.
  }
</script>
<svelte:head><title>SignalKit SvelteKit local lab</title></svelte:head>
<main>
  <h1>SignalKit SvelteKit lab</h1>
  <p>Synthetic data, local recorders, no external providers.</p>
  <nav><a href="/">Home</a> · <a href="/catalog">Catalog</a> · <a href="/connections">Connections</a></nav>
  <button disabled={!mounted} onclick={allow}>Allow analytics and observability</button>
  <button disabled={!mounted} onclick={() => client.getSignals().setConsent({ analytics: false, marketing: false, observability: false })}>Withdraw consent</button>
  <button disabled={!mounted} onclick={() => client.getSignals().track({ name: 'add_to_cart', properties: { currency: 'INR', value: 450, items: [{ item_id: 'notebook', price: 450, quantity: 1 }] } })}>Add demo cart event</button>
  <button onclick={() => fetch('/api/ping')}>Call API</button>
  {@render children()}
  <h2>Browser records</h2><pre id="records">{JSON.stringify(events, null, 2)}</pre>
</main>
<style>main { max-width: 900px; margin: 40px auto; padding: 20px; font-family: system-ui; } button { margin: 12px 6px 12px 0; padding: 10px; } pre { overflow: auto; } nav { margin: 20px 0; }</style>
