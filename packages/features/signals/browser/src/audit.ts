import { TRACKING_PARAMETERS, classifyReferrerHost } from '@techinject/core';
import type { Consent } from '@techinject/contracts';
import type { Attribution } from './attribution.js';
import { ownerState } from './owner.js';
export type AttributionFinding = {
  /** Stable identifier, safe to assert on in tests. */
  id:
    | 'attribution-disabled'
    | 'params-dropped-by-redirect'
    | 'params-removed-before-capture'
    | 'canonical-has-tracking-params'
    | 'csp-blocks-vendor'
    | 'storage-unavailable'
    | 'consent-never-granted'
    | 'multiple-sdk-instances';
  severity: 'error' | 'warning' | 'info';
  message: string;
  hint: string;
};
/** The subset of the browser API the self-check reads; any created SDK instance satisfies it. */
export type AuditableSignals = {
  getAttribution(): Attribution;
  getConsent(): Consent;
  getConnections(): { name: string }[];
  isAttributionEnabled?(): boolean;
  getAttributionCategory?(): keyof Consent | undefined;
};
export type AttributionAuditOptions = {
  signals?: AuditableSignals;
  document?: Document;
  location?: Location;
  performance?: Performance;
  /** Extra script hosts the page's Content-Security-Policy must allow, such as a tagging proxy. */
  expectedHosts?: string[];
};
const VENDOR_SCRIPT_HOSTS: Record<string, string> = {
  ga4: 'googletagmanager.com',
  'meta-pixel': 'connect.facebook.net',
};
function hasTrackingParameter(value: string | URL | null | undefined, base?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(String(value), base);
    return TRACKING_PARAMETERS.some((name) => url.searchParams.has(name));
  } catch {
    return false;
  }
}
function navigationEntry(performance: Performance | undefined) {
  try {
    const entry = performance?.getEntriesByType?.('navigation')?.[0] as
      | (PerformanceEntry & { redirectCount?: number })
      | undefined;
    return entry && typeof entry === 'object' ? entry : undefined;
  } catch {
    return undefined;
  }
}
function cspScriptSources(document: Document | undefined): string[] | undefined {
  try {
    const metas = Array.from(document?.querySelectorAll?.('meta[http-equiv]') ?? []);
    const policy = metas.find(
      (meta) => meta.getAttribute('http-equiv')?.trim().toLowerCase() === 'content-security-policy',
    );
    const content = policy?.getAttribute('content');
    if (!content) return undefined;
    const directives = new Map<string, string[]>();
    for (const part of content.split(';')) {
      const [name, ...sources] = part.trim().split(/\s+/);
      if (name) directives.set(name.toLowerCase(), sources);
    }
    return directives.get('script-src') ?? directives.get('default-src');
  } catch {
    return undefined;
  }
}
function allowsHost(sources: string[], host: string): boolean {
  return sources.some((source) => {
    const token = source.toLowerCase().replace(/^['"]|['"]$/g, '');
    if (token === '*') return true;
    const hostname = token.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/:]/)[0] ?? '';
    const bare = hostname.replace(/^\*\./, '');
    return (
      bare === host ||
      hostname.endsWith('.' + host) ||
      (token.startsWith('*.') && host.endsWith('.' + bare))
    );
  });
}
function storageUsable(document: Document | undefined): boolean {
  try {
    const scope = (document?.defaultView ?? globalThis) as { localStorage?: Storage };
    const storage = scope.localStorage;
    if (!storage) return false;
    const key = '__signalkit_audit__';
    storage.setItem(key, '1');
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
/**
 * Development self-check for the attribution integration mistakes the guide warns about:
 * capture disabled, redirects or routers dropping campaign parameters, tracking parameters on
 * the canonical URL, a meta CSP blocking a configured vendor, unusable storage, consent never
 * granted and competing SDK instances. Synchronous, framework-independent, never throws and
 * performs no network access. Call it after the SDK has started, for example from a dev-only
 * button or console helper; it reads the live document, location and navigation timing.
 */
export function auditAttribution(options: AttributionAuditOptions = {}): AttributionFinding[] {
  const findings: AttributionFinding[] = [];
  const check = (run: () => AttributionFinding | undefined) => {
    try {
      const finding = run();
      if (finding) findings.push(finding);
    } catch {
      /* A broken host object must not break the audit. */
    }
  };
  const document =
    options.document ??
    (typeof globalThis.document === 'undefined' ? undefined : globalThis.document);
  const location =
    options.location ??
    (typeof globalThis.location === 'undefined' ? undefined : globalThis.location);
  const performance =
    options.performance ??
    (typeof globalThis.performance === 'undefined' ? undefined : globalThis.performance);
  const signals = options.signals;
  const enabled = (() => {
    try {
      return !!signals && typeof signals.isAttributionEnabled === 'function'
        ? signals.isAttributionEnabled() === true
        : false;
    } catch {
      return false;
    }
  })();
  check(() =>
    signals && !enabled
      ? {
          id: 'attribution-disabled',
          severity: 'warning',
          message: 'Visit-source capture is off; getAttribution() will always be empty.',
          hint: 'Pass attribution: true (or { category, maxAgeDays }) in the browser, Next.js or SvelteKit config.',
        }
      : undefined,
  );
  check(() => {
    const entry = navigationEntry(performance);
    const redirects = Number(entry?.redirectCount ?? 0);
    if (!(redirects > 0) || hasTrackingParameter(location?.href)) return undefined;
    let referrerHost = '';
    try {
      referrerHost = document?.referrer ? new URL(document.referrer).hostname : '';
    } catch {
      return undefined;
    }
    const source = classifyReferrerHost(referrerHost);
    return source
      ? {
          id: 'params-dropped-by-redirect',
          severity: 'warning',
          message: `This ${source.kind} visit from ${source.source} passed through ${redirects} redirect${redirects === 1 ? '' : 's'} and landed without any campaign or click-ID parameter.`,
          hint: 'Make www/https/trailing-slash/locale redirects preserve the query string; organic visits carry none, but an ad click that lost its gclid, msclkid or fbclid is unattributable.',
        }
      : undefined;
  });
  check(() => {
    if (!signals || !enabled) return undefined;
    const touch = signals.getAttribution();
    if (touch.first || touch.last) return undefined;
    const entry = navigationEntry(performance);
    const landed = hasTrackingParameter(entry?.name, location?.href);
    const current = hasTrackingParameter(location?.href);
    if (!landed && !current) return undefined;
    return {
      id: 'params-removed-before-capture',
      severity: 'error',
      message: current
        ? 'The current URL carries tracking parameters but no visit source was captured; the SDK has not started yet.'
        : 'The page loaded with tracking parameters that were removed before the SDK captured them.',
      hint: current
        ? 'Call start() (SignalKitProvider and createSvelteKitClient().mount() do this) before running the audit.'
        : 'Do not router.replace() the parameters away in middleware or a layout above the provider; clean the URL from an effect rendered inside it.',
    };
  });
  check(() => {
    const links = Array.from(document?.querySelectorAll?.('link[rel~="canonical" i]') ?? []);
    const tainted = links.find((link) =>
      hasTrackingParameter(link.getAttribute('href'), location?.href),
    );
    return tainted
      ? {
          id: 'canonical-has-tracking-params',
          severity: 'error',
          message: 'The canonical link carries utm or click-ID parameters.',
          hint: 'Emit <link rel="canonical"> without tracking parameters so search engines index one URL per page.',
        }
      : undefined;
  });
  check(() => {
    const sources = cspScriptSources(document);
    if (!sources) return undefined;
    const required = new Set<string>(options.expectedHosts ?? []);
    for (const connection of signals?.getConnections() ?? []) {
      const host = VENDOR_SCRIPT_HOSTS[connection.name];
      if (host) required.add(host);
    }
    const blocked = [...required].filter((host) => host && !allowsHost(sources, host));
    return blocked.length
      ? {
          id: 'csp-blocks-vendor',
          severity: 'error',
          message: `The page's Content-Security-Policy script-src does not allow ${blocked.join(', ')}.`,
          hint: 'Allow https://www.googletagmanager.com for GA4 and https://connect.facebook.net for Meta Pixel, or pass a nonce to the provider factory.',
        }
      : undefined;
  });
  check(() =>
    storageUsable(document)
      ? undefined
      : {
          id: 'storage-unavailable',
          severity: 'warning',
          message:
            'localStorage is missing or throws, so the visit source cannot persist across pages.',
          hint: 'Check storage partitioning, private mode or a sandboxed frame; inject a cookie-backed storage if your checkout needs it.',
        },
  );
  check(() => {
    if (!signals || !enabled) return undefined;
    const category = signals.getAttributionCategory?.() ?? 'marketing';
    return signals.getConsent()[category]
      ? undefined
      : {
          id: 'consent-never-granted',
          severity: 'info',
          message: `Consent for ${category} is denied, so the visit source is held in memory only.`,
          hint: 'Nothing persists until setConsent grants that category; this is expected before the visitor decides.',
        };
  });
  check(() => {
    const state = ownerState();
    return state.refusedStarts > 0
      ? {
          id: 'multiple-sdk-instances',
          severity: 'warning',
          message: `${state.refusedStarts} additional SDK instance${state.refusedStarts === 1 ? '' : 's'} tried to start while another was active.`,
          hint: 'Create one createBrowserSignals/SignalKitProvider per page and dispose it on unmount; competing instances double-count page views.',
        }
      : undefined;
  });
  return findings;
}
