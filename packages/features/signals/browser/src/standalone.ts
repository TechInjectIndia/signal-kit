import { createBrowserSignals } from './index.js';
import { createGA4Provider, createMetaPixelProvider, createClarityProvider } from './providers.js';
import type { BrowserSignals } from './index.js';

declare global {
  interface Window {
    signals?: BrowserSignals;
  }
}

function initStandalone() {
  if (typeof window === 'undefined') return;

  // Locate the script tag that loaded this file to read data attributes
  const currentScript =
    document.currentScript ||
    document.querySelector('script[data-ga4-id]') ||
    document.querySelector('script[src*="signalkit"]');

  const ga4Id = currentScript?.getAttribute('data-ga4-id') || undefined;
  const metaId = currentScript?.getAttribute('data-meta-id') || undefined;
  const clarityId = currentScript?.getAttribute('data-clarity-id') || undefined;
  const autoConsent = currentScript?.getAttribute('data-auto-consent') === 'true';

  const providers = [];
  if (ga4Id && /^G-[A-Z0-9]+$/.test(ga4Id)) {
    try {
      providers.push(createGA4Provider({ measurementId: ga4Id }));
    } catch {}
  }
  if (metaId && /^\d+$/.test(metaId)) {
    try {
      providers.push(createMetaPixelProvider({ pixelId: metaId }));
    } catch {}
  }
  if (clarityId && /^[a-z0-9]+$/i.test(clarityId)) {
    try {
      providers.push(createClarityProvider({ projectId: clarityId }));
    } catch {}
  }

  const signals = createBrowserSignals({
    providers,
    consent: {
      analytics: autoConsent,
      marketing: autoConsent,
      observability: autoConsent,
    },
  });

  signals.start();
  window.signals = signals;

  // Declarative DOM listener for hybrid/HTML/PHP/Shopify projects
  document.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement)?.closest?.('[data-signal]');
    if (!target) return;

    const eventName = target.getAttribute('data-signal');
    if (!eventName) return;

    const itemId = target.getAttribute('data-item-id') || 'item';
    const itemName = target.getAttribute('data-item-name') || undefined;
    const price = parseFloat(target.getAttribute('data-price') || '0');
    const currency = target.getAttribute('data-currency') || 'INR';
    const quantity = parseInt(target.getAttribute('data-quantity') || '1', 10);

    if (eventName === 'add_to_cart' || eventName === 'begin_checkout') {
      void signals.track({
        name: eventName,
        properties: {
          currency,
          value: price * quantity,
          items: [{ item_id: itemId, item_name: itemName, price, quantity }],
        },
      });
    } else if (eventName === 'product_view') {
      void signals.track({
        name: 'product_view',
        properties: {
          currency,
          value: price,
          items: [{ item_id: itemId, item_name: itemName, price, quantity: 1 }],
        },
      });
    }
  });

  return signals;
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initStandalone());
  } else {
    initStandalone();
  }
}

export { initStandalone };
