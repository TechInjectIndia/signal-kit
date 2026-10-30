// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  window.signals?.dispose();
  delete window.signals;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.doUnmock('./providers.js');
  vi.resetModules();
});

it('keeps providers denied without data-auto-consent until the host grants consent', async () => {
  const ga4Send = vi.fn();
  const metaSend = vi.fn();
  const claritySend = vi.fn();
  vi.doMock('./providers.js', () => ({
    createGA4Provider: () => ({ name: 'ga4', category: 'analytics', send: ga4Send }),
    createMetaPixelProvider: () => ({ name: 'meta-pixel', category: 'marketing', send: metaSend }),
    createClarityProvider: () => ({ name: 'clarity', category: 'analytics', send: claritySend }),
  }));

  const script = document.createElement('script');
  script.setAttribute('data-ga4-id', 'G-TEST123');
  script.setAttribute('data-meta-id', '123456789');
  script.setAttribute('data-clarity-id', 'test123');
  vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script);
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');

  await import('./standalone.js');
  const signals = window.signals!;
  expect(signals.getConsent()).toEqual({
    analytics: false,
    marketing: false,
    observability: false,
  });
  await signals.page();
  await signals.flush();
  expect(ga4Send).not.toHaveBeenCalled();
  expect(metaSend).not.toHaveBeenCalled();
  expect(claritySend).not.toHaveBeenCalled();

  signals.setConsent({ analytics: true, marketing: true, observability: true });
  await signals.page();
  await signals.flush();
  expect(ga4Send).toHaveBeenCalledOnce();
  expect(metaSend).toHaveBeenCalledOnce();
  expect(claritySend).toHaveBeenCalledOnce();
});

it('skips incomplete declarative events and reports safe diagnostics without fabricated values', async () => {
  const events: unknown[] = [];
  vi.doMock('./providers.js', () => ({
    createGA4Provider: () => ({
      name: 'ga4',
      category: 'analytics',
      send: (event: unknown) => {
        events.push(event);
      },
    }),
    createMetaPixelProvider: vi.fn(),
    createClarityProvider: vi.fn(),
  }));
  const script = document.createElement('script');
  script.setAttribute('data-ga4-id', 'G-TEST123');
  vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script);
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  const diagnostics: unknown[] = [];
  const onDiagnostic = (event: Event) => diagnostics.push((event as CustomEvent).detail);
  window.addEventListener('signalkit:diagnostic', onDiagnostic);
  try {
    await import('./standalone.js');
    const signals = window.signals!;
    signals.setConsent({ analytics: true, marketing: false, observability: false });
    const button = document.createElement('button');
    button.setAttribute('data-signal', 'add_to_cart');
    document.body.append(button);

    button.click();
    button.setAttribute('data-item-id', 'sku-1');
    button.click();
    button.setAttribute('data-price', '100abc');
    button.click();
    button.setAttribute('data-price', '100');
    button.click();
    button.setAttribute('data-currency', 'invalid');
    button.click();
    button.setAttribute('data-currency', 'INR');
    button.click();
    button.setAttribute('data-quantity', '2x');
    button.click();
    await signals.flush();
    expect(events).toEqual([]);
    expect(diagnostics).toEqual([
      { status: 'invalid', reason: 'missing_attribute', attribute: 'data-item-id' },
      { status: 'invalid', reason: 'missing_attribute', attribute: 'data-price' },
      { status: 'invalid', reason: 'invalid_attribute', attribute: 'data-price' },
      { status: 'invalid', reason: 'missing_attribute', attribute: 'data-currency' },
      { status: 'invalid', reason: 'invalid_attribute', attribute: 'data-currency' },
      { status: 'invalid', reason: 'missing_attribute', attribute: 'data-quantity' },
      { status: 'invalid', reason: 'invalid_attribute', attribute: 'data-quantity' },
    ]);

    button.setAttribute('data-quantity', '2');
    button.click();
    await signals.flush();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: 'add_to_cart',
      properties: {
        currency: 'INR',
        value: 200,
        items: [{ item_id: 'sku-1', price: 100, quantity: 2 }],
      },
    });

    button.setAttribute('data-signal', 'product_view');
    button.setAttribute('data-price', '0');
    button.removeAttribute('data-quantity');
    button.click();
    await signals.flush();
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      name: 'product_view',
      properties: { currency: 'INR', value: 0, items: [{ item_id: 'sku-1', price: 0 }] },
    });
    expect(
      (events[1] as { properties: { items: Array<{ quantity?: number }> } }).properties.items[0],
    ).not.toHaveProperty('quantity');
  } finally {
    window.removeEventListener('signalkit:diagnostic', onDiagnostic);
  }
});
