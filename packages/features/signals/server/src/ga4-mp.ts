import { getProviderEvent } from '@techinject/contracts';
import type { Provider } from '@techinject/contracts';
import { safePageLocation, safeReferrer } from '@techinject/core';

export interface GA4MeasurementProtocolOptions {
  /** GA4 web stream measurement ID, `G-XXXXXXX`. Must be the stream the browser `client_id` came from. */
  measurementId: string;
  /** Measurement Protocol API secret. Server only: sent in the request query, never logged or thrown. */
  apiSecret: string;
  /**
   * Collection endpoint. Default `https://www.google-analytics.com/mp/collect`; use
   * `https://region1.google-analytics.com/mp/collect` for EU data collection.
   */
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  /** Fallbacks used only when the per-call `context.ga4` has no value. The SDK never invents a `client_id`. */
  clientId?: () => string | undefined;
  sessionId?: () => string | undefined;
  userId?: () => string | undefined;
  /**
   * `'marketing'` maps the dispatch's marketing consent to MP `consent.ad_user_data` and
   * `consent.ad_personalization`. Default `'denied'`: both are always `DENIED`.
   */
  googleAdsConsent?: 'denied' | 'marketing';
  /** Use the validation server (`/debug/mp/collect`). Events are NOT recorded; fixtures and sandbox only. */
  debug?: boolean;
}

const DEFAULT_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
/** GA4 accepts `timestamp_micros` up to 72 hours in the past. */
const MAX_BACKDATE_MS = 72 * 60 * 60 * 1000;
const CLIENT_ID = /^[A-Za-z0-9._-]{1,128}$/;
const SESSION_ID = /^\d{1,20}$/;
const USER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function collectUrl(options: GA4MeasurementProtocolOptions): URL {
  let url: URL;
  try {
    url = new URL(options.endpoint ?? DEFAULT_ENDPOINT);
  } catch {
    throw new Error('Invalid GA4 configuration');
  }
  if (!/^https?:$/.test(url.protocol) || url.search || url.hash || url.username || url.password)
    throw new Error('Invalid GA4 configuration');
  if (options.debug && !url.pathname.startsWith('/debug/')) {
    if (!/\/mp\/collect\/?$/.test(url.pathname)) throw new Error('Invalid GA4 configuration');
    url.pathname = `/debug${url.pathname}`;
  }
  url.searchParams.set('measurement_id', options.measurementId);
  url.searchParams.set('api_secret', options.apiSecret);
  return url;
}

function pick(
  fromContext: string | undefined,
  fallback: (() => string | undefined) | undefined,
  valid: RegExp,
  message: string,
): string | undefined {
  let value = fromContext;
  if (value === undefined) {
    try {
      value = fallback?.();
    } catch {
      throw new Error(message);
    }
  }
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !valid.test(value)) throw new Error(message);
  return value;
}

/**
 * GA4 Measurement Protocol provider (server only). Delivers the event under its GA4 name with the
 * per-call `context.ga4` identifiers. A 2xx from the live endpoint means the envelope was received,
 * not that GA4 accepted the event; verify in DebugView. When this provider is enabled, send GA4
 * `purchase` from the server only and dispatch the browser copy with `providers` naming every
 * browser provider except `ga4`, when the server copy will actually be sent.
 */
export function createGA4MeasurementProtocolProvider(
  options: GA4MeasurementProtocolOptions,
): Provider {
  if (
    typeof options?.measurementId !== 'string' ||
    !/^G-[A-Z0-9]+$/.test(options.measurementId) ||
    typeof options.apiSecret !== 'string' ||
    !/^[\x21-\x7e]{1,256}$/.test(options.apiSecret) ||
    (options.googleAdsConsent !== undefined &&
      options.googleAdsConsent !== 'denied' &&
      options.googleAdsConsent !== 'marketing')
  )
    throw new Error('Invalid GA4 configuration');
  // Holds the secret; never stringified into an error or diagnostic.
  const url = collectUrl(options);
  const transport = options.fetch ?? globalThis.fetch;
  return {
    name: 'ga4-mp',
    eventFamily: 'ga4',
    category: 'analytics',
    async send(event, signal) {
      if (event.consent && event.consent.analytics !== true)
        throw new Error('GA4 analytics consent denied');
      const mapped = getProviderEvent(event, 'ga4');
      const ga4 = event.context?.ga4;
      // Read every value up front: nothing is shared between concurrent sends.
      const clientId = pick(
        ga4?.clientId,
        options.clientId,
        CLIENT_ID,
        'GA4 client_id missing or invalid',
      );
      if (!clientId) throw new Error('GA4 client_id missing or invalid');
      const sessionId = pick(
        ga4?.sessionId,
        options.sessionId,
        SESSION_ID,
        'Invalid GA4 session_id',
      );
      const userId = pick(ga4?.userId, options.userId, USER_ID, 'Invalid GA4 user_id');
      const age = Date.now() - event.timestamp;
      const ads =
        options.googleAdsConsent === 'marketing' && event.consent?.marketing === true
          ? 'GRANTED'
          : 'DENIED';
      const page = event.context?.page;
      const params: Record<string, unknown> = {
        ...(page?.location ? { page_location: safePageLocation(page.location) } : {}),
        ...(page?.referrer && safeReferrer(page.referrer)
          ? { page_referrer: safeReferrer(page.referrer) }
          : {}),
        ...mapped.properties,
        // engagement_time_msec is only meaningful with a session; both make the hit count as active.
        ...(sessionId ? { session_id: sessionId, engagement_time_msec: 1 } : {}),
      };
      const body = JSON.stringify({
        client_id: clientId,
        ...(userId ? { user_id: userId } : {}),
        // Older than 72 h or in the future: omit, so GA4 records it at receipt time.
        ...(age >= 0 && age <= MAX_BACKDATE_MS
          ? { timestamp_micros: Math.floor(event.timestamp) * 1000 }
          : {}),
        consent: { ad_user_data: ads, ad_personalization: ads },
        events: [{ name: mapped.name, params }],
      });
      let response: Response;
      try {
        response = await transport(url.toString(), {
          method: 'POST',
          signal: signal ?? null,
          headers: { 'content-type': 'application/json' },
          body,
        });
      } catch {
        // Transport errors can embed the request URL, whose query holds the API secret.
        throw new Error('GA4 Measurement Protocol transport failed');
      }
      if (!response.ok) throw new Error('GA4 Measurement Protocol rejected event');
      if (!options.debug) return;
      let result: { validationMessages?: unknown };
      try {
        result = (await response.json()) as { validationMessages?: unknown };
      } catch {
        throw new Error('GA4 Measurement Protocol validation response unreadable');
      }
      if (!Array.isArray(result?.validationMessages) || result.validationMessages.length > 0)
        throw new Error('GA4 Measurement Protocol validation failed');
    },
  };
}
