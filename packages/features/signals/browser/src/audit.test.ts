// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { auditAttribution, type AttributionFinding } from './audit.js';
import { createBrowserSignals } from './index.js';
const ids = (findings: AttributionFinding[]) => findings.map((finding) => finding.id);
const disposals: (() => void)[] = [];
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose());
  history.replaceState(null, '', '/');
  document.head.innerHTML = '';
  localStorage.clear();
});
function fakePerformance(name: string, redirectCount = 0): Performance {
  return {
    getEntriesByType: () => [{ name, redirectCount, entryType: 'navigation' }],
  } as unknown as Performance;
}
function fakeDocument(input: { referrer?: string; head?: string; storage?: Storage | null }) {
  const doc = document.implementation.createHTMLDocument('audit');
  doc.head.innerHTML = input.head ?? '';
  Object.defineProperty(doc, 'referrer', { value: input.referrer ?? '' });
  Object.defineProperty(doc, 'defaultView', {
    value: {
      get localStorage() {
        if (input.storage === null) throw new Error('blocked');
        return input.storage ?? localStorage;
      },
    },
  });
  return doc;
}
const location = (href: string) => new URL(href) as unknown as Location;
const consent = { analytics: true, marketing: true, observability: true };
describe('auditAttribution', () => {
  it('returns no findings for a clean landing with capture enabled and consent granted', () => {
    history.replaceState(null, '', '/?gclid=test');
    const sdk = createBrowserSignals({ consent, attribution: true });
    disposals.push(sdk.dispose);
    expect(
      auditAttribution({
        signals: sdk,
        document: fakeDocument({}),
        performance: fakePerformance(location.href),
      }),
    ).toEqual([]);
  });
  it('reports capture disabled and skips capture-dependent checks', () => {
    history.replaceState(null, '', '/?utm_source=x');
    const sdk = createBrowserSignals({ consent });
    disposals.push(sdk.dispose);
    const findings = auditAttribution({ signals: sdk, document: fakeDocument({}) });
    expect(ids(findings)).toEqual(['attribution-disabled']);
    expect(findings[0].severity).toBe('warning');
    expect(ids(auditAttribution({ document: fakeDocument({}) }))).toEqual([]);
  });
  it('flags a redirected search or social visit that arrived without parameters', () => {
    const findings = auditAttribution({
      document: fakeDocument({ referrer: 'https://www.google.com/' }),
      location: location('https://shop.example/'),
      performance: fakePerformance('https://shop.example/', 2),
    });
    expect(ids(findings)).toEqual(['params-dropped-by-redirect']);
    expect(findings[0].message).toContain('2 redirects');
    expect(findings[0].severity).toBe('warning');
    expect(
      auditAttribution({
        document: fakeDocument({ referrer: 'https://partner.example/' }),
        location: location('https://shop.example/'),
        performance: fakePerformance('https://shop.example/', 1),
      }),
    ).toEqual([]);
    expect(
      auditAttribution({
        document: fakeDocument({ referrer: 'https://www.bing.com/' }),
        location: location('https://shop.example/?msclkid=1'),
        performance: fakePerformance('https://shop.example/?msclkid=1', 1),
      }),
    ).toEqual([]);
  });
  it('flags parameters stripped by a router before the SDK captured them', () => {
    const sdk = createBrowserSignals({ consent, attribution: true, autoTrack: false });
    disposals.push(sdk.dispose);
    sdk.start();
    history.replaceState(null, '', '/landing');
    const findings = auditAttribution({
      signals: sdk,
      document: fakeDocument({}),
      performance: fakePerformance('http://localhost:3000/landing?gclid=abc'),
    });
    expect(ids(findings)).toEqual(['params-removed-before-capture']);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('removed before');
  });
  it('explains that the SDK has not started when the URL still carries parameters', () => {
    history.replaceState(null, '', '/?fbclid=1');
    const sdk = createBrowserSignals({ consent, attribution: true, autoTrack: false });
    disposals.push(sdk.dispose);
    const findings = auditAttribution({
      signals: sdk,
      document: fakeDocument({}),
      performance: fakePerformance(location.href),
    });
    expect(ids(findings)).toEqual(['params-removed-before-capture']);
    expect(findings[0].hint).toContain('start()');
  });
  it('flags a canonical link with tracking parameters', () => {
    const findings = auditAttribution({
      document: fakeDocument({
        head: '<link rel="canonical" href="/p/42?utm_source=newsletter">',
      }),
      location: location('https://shop.example/p/42?utm_source=newsletter'),
    });
    expect(ids(findings)).toEqual(['canonical-has-tracking-params']);
    expect(findings[0].severity).toBe('error');
    expect(
      auditAttribution({
        document: fakeDocument({ head: '<link rel="canonical" href="https://shop.example/p/42">' }),
        location: location('https://shop.example/p/42?utm_source=newsletter'),
      }),
    ).toEqual([]);
  });
  it('flags a meta CSP whose script-src blocks a configured vendor or expected host', () => {
    const sdk = createBrowserSignals({
      consent,
      attribution: true,
      providers: [
        { name: 'ga4', category: 'analytics', send() {} },
        { name: 'meta-pixel', category: 'marketing', send() {} },
      ],
    });
    disposals.push(sdk.dispose);
    const policy = (value: string) =>
      fakeDocument({ head: `<meta http-equiv="Content-Security-Policy" content="${value}">` });
    const blocked = auditAttribution({
      signals: sdk,
      document: policy("default-src 'self'; script-src 'self' https://www.googletagmanager.com"),
      performance: fakePerformance(location.href),
    });
    expect(ids(blocked)).toEqual(['csp-blocks-vendor']);
    expect(blocked[0].message).toContain('connect.facebook.net');
    expect(blocked[0].message).not.toContain('googletagmanager.com');
    expect(
      auditAttribution({
        signals: sdk,
        document: policy(
          "script-src 'self' 'nonce-abc' *.googletagmanager.com https://connect.facebook.net/en_US/",
        ),
        performance: fakePerformance(location.href),
      }),
    ).toEqual([]);
    expect(
      ids(
        auditAttribution({
          document: policy("default-src 'self'"),
          expectedHosts: ['tags.shop.example'],
        }),
      ),
    ).toEqual(['csp-blocks-vendor']);
    expect(auditAttribution({ document: fakeDocument({ head: '' }) })).toEqual([]);
    expect(auditAttribution({ document: policy('script-src *') })).toEqual([]);
  });
  it('flags unusable storage', () => {
    const blocked = auditAttribution({ document: fakeDocument({ storage: null }) });
    expect(ids(blocked)).toEqual(['storage-unavailable']);
    const full = {
      getItem: () => null,
      setItem() {
        throw new Error('QuotaExceededError');
      },
      removeItem() {},
    } as unknown as Storage;
    expect(ids(auditAttribution({ document: fakeDocument({ storage: full }) }))).toEqual([
      'storage-unavailable',
    ]);
    expect(localStorage.getItem('__signalkit_audit__')).toBeNull();
  });
  it('reports denied consent for the configured category as information', () => {
    const sdk = createBrowserSignals({
      consent: { analytics: true, marketing: false, observability: false },
      attribution: { category: 'analytics' },
    });
    disposals.push(sdk.dispose);
    expect(
      auditAttribution({
        signals: sdk,
        document: fakeDocument({}),
        performance: fakePerformance('/'),
      }),
    ).toEqual([]);
    sdk.setConsent({ analytics: false, marketing: true, observability: false });
    const findings = auditAttribution({
      signals: sdk,
      document: fakeDocument({}),
      performance: fakePerformance('/'),
    });
    expect(ids(findings)).toEqual(['consent-never-granted']);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].message).toContain('analytics');
  });
  it('reports a second instance that tried to start while another was active', () => {
    const first = createBrowserSignals({ consent, attribution: true });
    const second = createBrowserSignals({ consent, attribution: true });
    disposals.push(first.dispose, second.dispose);
    const findings = auditAttribution({
      signals: first,
      document: fakeDocument({}),
      performance: fakePerformance(location.href),
    });
    expect(ids(findings)).toEqual(['multiple-sdk-instances']);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].message).toContain('1 additional SDK instance ');
  });
  it('never throws on hostile inputs', () => {
    const hostile = {
      signals: {
        getAttribution() {
          throw new Error('boom');
        },
        getConsent() {
          throw new Error('boom');
        },
        getConnections() {
          throw new Error('boom');
        },
        isAttributionEnabled() {
          throw new Error('boom');
        },
      },
      document: {
        get referrer() {
          throw new Error('boom');
        },
        querySelectorAll() {
          throw new Error('boom');
        },
        get defaultView() {
          throw new Error('boom');
        },
      } as unknown as Document,
      location: { href: 'not a url' } as Location,
      performance: {
        getEntriesByType() {
          throw new Error('boom');
        },
      } as unknown as Performance,
    };
    expect(() => auditAttribution(hostile)).not.toThrow();
    expect(() => auditAttribution({ document: null as unknown as Document })).not.toThrow();
    expect(() =>
      auditAttribution({
        signals: {} as never,
        document: {} as Document,
        location: {} as Location,
        performance: { getEntriesByType: () => [null] } as unknown as Performance,
      }),
    ).not.toThrow();
    for (const finding of auditAttribution(hostile)) {
      expect(typeof finding.message).toBe('string');
      expect(typeof finding.hint).toBe('string');
    }
  });
});
