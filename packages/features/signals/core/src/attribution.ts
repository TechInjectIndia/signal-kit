import { safeRoute } from './index.js';

export type AttributionChannel =
  | 'paid_search'
  | 'paid_social'
  | 'paid_other'
  | 'organic_search'
  | 'ai_search'
  | 'organic_social'
  | 'email'
  | 'referral'
  | 'direct'
  | 'other';
export type ClickIdName = 'gclid' | 'gbraid' | 'wbraid' | 'msclkid' | 'fbclid';
export type AttributionTouch = {
  channel: AttributionChannel;
  /** Normalized traffic source: google, bing, facebook, a referrer host or (direct). */
  source: string;
  /** cpc, paid_social, organic, ai, social, email, referral, (none) or the supplied utm_medium. */
  medium: string;
  campaign?: string;
  campaignId?: string;
  /** Paid-search keyword from utm_term={keyword}; organic engines never expose terms in the URL. */
  term?: string;
  content?: string;
  clickIds?: Partial<Record<ClickIdName, string>>;
  landingPath: string;
  referrerHost?: string;
  timestamp: number;
};
export type AttributionInput = {
  url: string | URL;
  referrer?: string | null;
  timestamp?: number;
};

/** Query parameters that may stay on GA4 page_location; every other parameter is stripped. */
export const TRACKING_PARAMETERS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'fbclid',
] as const;
const CLICK_IDS: ClickIdName[] = ['gclid', 'gbraid', 'wbraid', 'msclkid', 'fbclid'];
const SEARCH_ENGINES: [RegExp, string][] = [
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)yahoo\.[a-z.]+$/, 'yahoo'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)yandex\.[a-z.]+$/, 'yandex'],
  [/(^|\.)baidu\.com$/, 'baidu'],
  [/(^|\.)ecosia\.org$/, 'ecosia'],
  [/^search\.brave\.com$/, 'brave'],
  [/(^|\.)startpage\.com$/, 'startpage'],
  [/(^|\.)qwant\.com$/, 'qwant'],
  [/(^|\.)naver\.com$/, 'naver'],
  [/(^|\.)seznam\.cz$/, 'seznam'],
  [/(^|\.)ask\.com$/, 'ask'],
  [/(^|\.)aol\.[a-z.]+$/, 'aol'],
];
const AI_ENGINES: [RegExp, string][] = [
  [/^gemini\.google\.com$/, 'gemini'],
  [/(^|\.)(chatgpt\.com|openai\.com)$/, 'chatgpt'],
  [/(^|\.)perplexity\.ai$/, 'perplexity'],
  [/(^|\.)claude\.ai$/, 'claude'],
  [/^copilot\.microsoft\.com$/, 'copilot'],
  [/(^|\.)you\.com$/, 'you'],
  [/(^|\.)mistral\.ai$/, 'mistral'],
];
const SOCIAL_NETWORKS: [RegExp, string][] = [
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(twitter\.com|x\.com|t\.co)$/, 'x'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'linkedin'],
  [/(^|\.)pinterest\.[a-z.]+$/, 'pinterest'],
  [/(^|\.)reddit\.com$/, 'reddit'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)threads\.(net|com)$/, 'threads'],
  [/(^|\.)snapchat\.com$/, 'snapchat'],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
  [/(^|\.)(telegram\.org|t\.me)$/, 'telegram'],
  [/(^|\.)quora\.com$/, 'quora'],
];
const PAID_SEARCH_MEDIUMS = /^(cpc|ppc|paid[-_ ]?search|sem)$/;
const PAID_SOCIAL_MEDIUMS = /^(paid[-_ ]?social|social[-_ ]?paid)$/;
const PAID_OTHER_MEDIUMS = /^(cpm|cpv|cpa|display|banner|retargeting|affiliate|paid[-_ ]?.*)$/;
const SOCIAL_MEDIUMS = /^(social|social[-_ ]?network|social[-_ ]?media|sm)$/;
const EMAIL_MEDIUMS = /^(email|e-mail|newsletter)$/;

function parseUrl(value: string | URL): URL | undefined {
  try {
    return new URL(String(value));
  } catch {
    return undefined;
  }
}
/**
 * Clamp a user-controlled tracking value. Anything that looks like an email or exceeds the
 * length budget is dropped so an ad parameter can never carry personal data into providers.
 */
function safeValue(value: string | null, max: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001f<>"']/.test(trimmed)) return undefined;
  if (trimmed.includes('@')) return undefined;
  return trimmed;
}
function lookup(host: string, table: [RegExp, string][]): string | undefined {
  return table.find(([pattern]) => pattern.test(host))?.[1];
}
export type ReferrerClass = { kind: 'search' | 'ai' | 'social'; source: string };
/** Known search engine, AI assistant or social network behind a referrer host; undefined otherwise. */
export function classifyReferrerHost(host: string | null | undefined): ReferrerClass | undefined {
  if (typeof host !== 'string') return undefined;
  const name = host.trim().toLowerCase();
  if (!name) return undefined;
  const engine = lookup(name, SEARCH_ENGINES);
  if (engine) return { kind: 'search', source: engine };
  const ai = lookup(name, AI_ENGINES);
  if (ai) return { kind: 'ai', source: ai };
  const social = lookup(name, SOCIAL_NETWORKS);
  return social ? { kind: 'social', source: social } : undefined;
}
/** Scheme and host of a referrer only; path, query, credentials and fragment never leave the page. */
export function safeReferrer(referrer: string | URL | null | undefined): string {
  if (!referrer) return '';
  const url = parseUrl(referrer);
  if (!url || !/^https?:$/.test(url.protocol)) return '';
  return `${url.origin}/`;
}
/** Origin, redacted path and only the allowlisted campaign/click parameters of a page URL. */
export function safePageLocation(value: string | URL): string {
  const url = parseUrl(value);
  if (!url) return '/';
  const params = new URLSearchParams();
  for (const name of TRACKING_PARAMETERS) {
    const safe = safeValue(url.searchParams.get(name), 256);
    if (safe !== undefined) params.set(name, safe);
  }
  const query = params.toString();
  return `${url.origin}${safeRoute(url)}${query ? `?${query}` : ''}`;
}
/** Meta's _fbc cookie value for a landing fbclid, for hosts passing it to the Conversions API. */
export function metaClickCookie(fbclid: string, timestamp = Date.now()): string | undefined {
  const safe = safeValue(fbclid, 256);
  return safe && /^[A-Za-z0-9_-]+$/.test(safe)
    ? `fb.1.${Math.floor(timestamp)}.${safe}`
    : undefined;
}
/**
 * Classify the visit that landed on `url`. Returns undefined for internal navigation (same-origin
 * referrer without campaign parameters), since that is not a new touch.
 */
export function parseAttribution(input: AttributionInput): AttributionTouch | undefined {
  const url = parseUrl(input.url);
  if (!url) return undefined;
  const timestamp = Number.isFinite(input.timestamp) ? input.timestamp! : Date.now();
  const referrer = input.referrer ? parseUrl(input.referrer) : undefined;
  const referrerHost =
    referrer && /^https?:$/.test(referrer.protocol) && referrer.origin !== url.origin
      ? referrer.hostname.toLowerCase()
      : undefined;
  const internal =
    referrer && /^https?:$/.test(referrer.protocol) && referrer.origin === url.origin;
  const clickIds: Partial<Record<ClickIdName, string>> = {};
  for (const name of CLICK_IDS) {
    const value = safeValue(url.searchParams.get(name), 256);
    if (value) clickIds[name] = value;
  }
  const utm = {
    source: safeValue(url.searchParams.get('utm_source'), 100),
    medium: safeValue(url.searchParams.get('utm_medium'), 100),
    campaign: safeValue(url.searchParams.get('utm_campaign'), 150),
    campaignId: safeValue(url.searchParams.get('utm_id'), 100),
    term: safeValue(url.searchParams.get('utm_term'), 200),
    content: safeValue(url.searchParams.get('utm_content'), 150),
  };
  const hasClickId = Object.keys(clickIds).length > 0;
  if (internal && !utm.source && !utm.medium && !hasClickId) return undefined;
  const base = {
    landingPath: safeRoute(url),
    timestamp,
    ...(referrerHost ? { referrerHost } : {}),
    ...(hasClickId ? { clickIds } : {}),
    ...(utm.campaign ? { campaign: utm.campaign } : {}),
    ...(utm.campaignId ? { campaignId: utm.campaignId } : {}),
    ...(utm.term ? { term: utm.term } : {}),
    ...(utm.content ? { content: utm.content } : {}),
  };
  const engine = referrerHost ? lookup(referrerHost, SEARCH_ENGINES) : undefined;
  const ai = referrerHost ? lookup(referrerHost, AI_ENGINES) : undefined;
  const social = referrerHost ? lookup(referrerHost, SOCIAL_NETWORKS) : undefined;
  // Auto-tagged ad clicks are authoritative even without UTM parameters.
  if (clickIds.gclid || clickIds.gbraid || clickIds.wbraid)
    return {
      ...base,
      channel: 'paid_search',
      source: utm.source ?? 'google',
      medium: utm.medium ?? 'cpc',
    };
  if (clickIds.msclkid)
    return {
      ...base,
      channel: 'paid_search',
      source: utm.source ?? 'bing',
      medium: utm.medium ?? 'cpc',
    };
  if (utm.medium) {
    const medium = utm.medium.toLowerCase();
    const source = utm.source ?? engine ?? ai ?? social ?? referrerHost ?? '(not set)';
    if (PAID_SEARCH_MEDIUMS.test(medium))
      return {
        ...base,
        channel:
          engine || /google|bing|yahoo|duckduckgo/.test(source) ? 'paid_search' : 'paid_other',
        source,
        medium: utm.medium,
      };
    if (PAID_SOCIAL_MEDIUMS.test(medium))
      return { ...base, channel: 'paid_social', source, medium: utm.medium };
    if (SOCIAL_MEDIUMS.test(medium))
      return { ...base, channel: 'organic_social', source, medium: utm.medium };
    if (EMAIL_MEDIUMS.test(medium))
      return { ...base, channel: 'email', source, medium: utm.medium };
    if (medium === 'organic')
      return { ...base, channel: 'organic_search', source, medium: utm.medium };
    if (medium === 'referral') return { ...base, channel: 'referral', source, medium: utm.medium };
    if (PAID_OTHER_MEDIUMS.test(medium))
      return { ...base, channel: 'paid_other', source, medium: utm.medium };
    return { ...base, channel: 'other', source, medium: utm.medium };
  }
  if (utm.source) return { ...base, channel: 'other', source: utm.source, medium: '(not set)' };
  // fbclid is appended to every outbound Facebook click, paid or organic.
  if (clickIds.fbclid)
    return { ...base, channel: 'organic_social', source: social ?? 'facebook', medium: 'social' };
  if (ai) return { ...base, channel: 'ai_search', source: ai, medium: 'ai' };
  if (engine) return { ...base, channel: 'organic_search', source: engine, medium: 'organic' };
  if (social) return { ...base, channel: 'organic_social', source: social, medium: 'social' };
  if (referrerHost)
    return {
      ...base,
      channel: 'referral',
      source: referrerHost.replace(/^www\./, ''),
      medium: 'referral',
    };
  return { ...base, channel: 'direct', source: '(direct)', medium: '(none)' };
}
