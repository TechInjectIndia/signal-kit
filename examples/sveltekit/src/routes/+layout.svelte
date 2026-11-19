<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { createSvelteKitClient, createGA4Provider, createMetaPixelProvider, createClarityProvider } from '@techinject/sveltekit';
  import type { SignalEvent, RequestRecord } from '@techinject/contracts';
  import { GA4_MEASUREMENT_ID, META_PIXEL_ID, CLARITY_PROJECT_ID, ENABLE_EXTERNAL_PROVIDERS } from '../../signalkit.config';
  import { exampleEvents } from '../../signalkit.events';
  let { children } = $props();
  let events = $state<(SignalEvent | RequestRecord)[]>([]);
  let mounted = $state(false);
  const client = createSvelteKitClient({
    events: exampleEvents,
    consent: { analytics: false, marketing: false, observability: false },
    // One consent-time page_view for the newly granted category. It targets providers with an
    // eventFamily, so the local recorder declares 'ga4' to stand in for a real GA4 provider.
    // Do not call page() after a grant.
    pageOnConsent: true,
    providers: [
      { name: 'local', category: 'analytics', eventFamily: 'ga4', send(event) { events = [...events, event]; } },
      ...(ENABLE_EXTERNAL_PROVIDERS
        ? [
            createGA4Provider({ measurementId: GA4_MEASUREMENT_ID }),
            createMetaPixelProvider({ pixelId: META_PIXEL_ID }),
            createClarityProvider({ projectId: CLARITY_PROJECT_ID }),
          ]
        : []),
    ],
    observer: { record(record) { events = [...events, record]; } },
  });
  setContext('signals', client);
  onMount(() => { client.mount(); mounted = true; return () => client.dispose(); });
  function allow() {
    client.getSignals().setConsent({ analytics: true, marketing: false, observability: true });
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
  <button disabled={!mounted} onclick={() => client.getSignals().track({ name: 'phone_click', properties: { channel: 'phone' } })}>Track phone contact</button>
  <button disabled={!mounted} onclick={() => client.getSignals().track({ name: 'whatsapp_click', properties: { channel: 'whatsapp' } })}>Track WhatsApp contact</button>
  <button disabled={!mounted} onclick={() => client.getSignals().track({ name: 'custom_event', properties: { action: 'help_open' } })}>Track help opened</button>
  <button onclick={() => fetch('/api/ping')}>Call API</button>
  {@render children()}
  <h2>Browser records</h2><pre id="records">{JSON.stringify(events, null, 2)}</pre>
</main>
<style>main { max-width: 900px; margin: 40px auto; padding: 20px; font-family: system-ui; } button { margin: 12px 6px 12px 0; padding: 10px; } pre { overflow: auto; } nav { margin: 20px 0; }</style>
