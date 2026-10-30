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

  const diagnostic = (
    reason: 'missing_attribute' | 'invalid_attribute',
    attribute: 'data-item-id' | 'data-price' | 'data-currency' | 'data-quantity' | 'data-item-name',
  ) => {
    try {
      window.dispatchEvent(
        new CustomEvent('signalkit:diagnostic', {
          detail: { status: 'invalid', reason, attribute },
        }),
      );
    } catch {
      /* Diagnostics cannot affect the host click. */
    }
  };

  // Declarative DOM listener for hybrid/HTML/PHP/Shopify projects
  const onClick = (event: MouseEvent) => {
    const target = (event.target as HTMLElement)?.closest?.('[data-signal]');
    if (!target) return;

    const eventName = target.getAttribute('data-signal');
    if (
      eventName !== 'product_view' &&
      eventName !== 'add_to_cart' &&
      eventName !== 'begin_checkout'
    )
      return;

    const required = (attribute: 'data-item-id' | 'data-price' | 'data-currency') => {
      const value = target.getAttribute(attribute)?.trim();
      if (!value) diagnostic('missing_attribute', attribute);
      return value;
    };
    const itemId = required('data-item-id');
    if (!itemId) return;
    if (itemId.length > 128) {
      diagnostic('invalid_attribute', 'data-item-id');
      return;
    }
    const priceText = required('data-price');
    if (!priceText) return;
    const price = Number(priceText);
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(priceText) || !Number.isFinite(price)) {
      diagnostic('invalid_attribute', 'data-price');
      return;
    }
    const currency = required('data-currency');
    if (!currency) return;
    if (!/^[A-Z]{3}$/.test(currency)) {
      diagnostic('invalid_attribute', 'data-currency');
      return;
    }
    const itemName = target.getAttribute('data-item-name')?.trim();
    if (itemName && itemName.length > 128) {
      diagnostic('invalid_attribute', 'data-item-name');
      return;
    }
    const quantityText = target.getAttribute('data-quantity')?.trim();
    if (eventName !== 'product_view' && !quantityText) {
      diagnostic('missing_attribute', 'data-quantity');
      return;
    }
    let quantity: number | undefined;
    if (quantityText !== undefined) {
      quantity = Number(quantityText);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
        diagnostic('invalid_attribute', 'data-quantity');
        return;
      }
    }

    const item = {
      item_id: itemId,
      ...(itemName ? { item_name: itemName } : {}),
      price,
      ...(quantity === undefined ? {} : { quantity }),
    };

    if (eventName === 'add_to_cart' || eventName === 'begin_checkout') {
      const value = price * quantity!;
      if (!Number.isFinite(value)) {
        diagnostic('invalid_attribute', 'data-price');
        return;
      }
      void signals.track({
        name: eventName,
        properties: {
          currency,
          value,
          items: [item],
        },
      });
    } else {
      void signals.track({
        name: 'product_view',
        properties: {
          currency,
          value: price,
          items: [item],
        },
      });
    }
  };
  document.addEventListener('click', onClick);
  const dispose = signals.dispose;
  signals.dispose = () => {
    document.removeEventListener('click', onClick);
    dispose();
    if (window.signals === signals) delete window.signals;
  };

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
