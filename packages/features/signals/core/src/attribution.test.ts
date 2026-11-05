import { describe, expect, it } from 'vitest';
import {
  metaClickCookie,
  parseAttribution,
  safePageLocation,
  safeReferrer,
  TRACKING_PARAMETERS,
} from './index.js';
const site = 'https://shop.test';
describe('safe campaign URLs for providers', () => {
  it('keeps only allowlisted campaign and click parameters on page_location', () => {
    const location = safePageLocation(
      `${site}/orders/123?utm_source=google&utm_medium=cpc&gclid=abc123&email=me@example.test&token=secret&utm_term=notebook%20pen`,
    );
    expect(location).toBe(
      `${site}/orders/:id?utm_source=google&utm_medium=cpc&utm_term=notebook+pen&gclid=abc123`,
    );
    expect(location).not.toContain('secret');
    expect(location).not.toContain('example.test');
    expect(TRACKING_PARAMETERS).toContain('msclkid');
  });
  it('drops oversized, email-like or script-like parameter values', () => {
    expect(safePageLocation(`${site}/?utm_campaign=${'a'.repeat(300)}`)).toBe(`${site}/`);
    expect(safePageLocation(`${site}/?utm_source=me@example.test`)).toBe(`${site}/`);
    expect(safePageLocation(`${site}/?utm_source=%3Cscript%3E`)).toBe(`${site}/`);
    expect(safePageLocation('not a url')).toBe('/');
  });
  it('reduces a referrer to its origin', () => {
    expect(safeReferrer('https://www.google.com/search?q=private+query')).toBe(
      'https://www.google.com/',
    );
    expect(safeReferrer('')).toBe('');
    expect(safeReferrer('javascript:alert(1)')).toBe('');
    expect(safeReferrer(undefined)).toBe('');
  });
  it('formats a Meta click cookie from a landing fbclid', () => {
    expect(metaClickCookie('IwAR0abc_-', 1700000000000)).toBe('fb.1.1700000000000.IwAR0abc_-');
    expect(metaClickCookie('bad value', 1)).toBeUndefined();
  });
});
describe('visit classification', () => {
  const touch = (url: string, referrer?: string) =>
    parseAttribution({ url: `${site}${url}`, referrer, timestamp: 1 });
  it('treats Google and Microsoft auto-tagging as paid search', () => {
    expect(touch('/landing?gclid=abc')).toMatchObject({
      channel: 'paid_search',
      source: 'google',
      medium: 'cpc',
      clickIds: { gclid: 'abc' },
      landingPath: '/landing',
    });
    expect(touch('/landing?wbraid=w1')).toMatchObject({ channel: 'paid_search', source: 'google' });
    expect(touch('/?msclkid=m1&utm_term=field%20notebook')).toMatchObject({
      channel: 'paid_search',
      source: 'bing',
      medium: 'cpc',
      term: 'field notebook',
    });
  });
  it('honours explicit UTM mediums and keeps the paid-search keyword', () => {
    expect(
      touch(
        '/?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=notebook&utm_content=ad1&utm_id=c1',
      ),
    ).toMatchObject({
      channel: 'paid_search',
      source: 'google',
      medium: 'cpc',
      campaign: 'spring',
      term: 'notebook',
      content: 'ad1',
      campaignId: 'c1',
    });
    expect(touch('/?utm_source=facebook&utm_medium=paid_social&fbclid=x')).toMatchObject({
      channel: 'paid_social',
      source: 'facebook',
      clickIds: { fbclid: 'x' },
    });
    expect(touch('/?utm_source=partner&utm_medium=cpc')).toMatchObject({ channel: 'paid_other' });
    expect(touch('/?utm_source=crm&utm_medium=email')).toMatchObject({ channel: 'email' });
    expect(touch('/?utm_source=linkedin&utm_medium=social')).toMatchObject({
      channel: 'organic_social',
    });
    expect(touch('/?utm_source=sponsor&utm_medium=display')).toMatchObject({
      channel: 'paid_other',
    });
    expect(touch('/?utm_source=podcast&utm_medium=audio')).toMatchObject({
      channel: 'other',
      medium: 'audio',
    });
    expect(touch('/?utm_source=flyer')).toMatchObject({ channel: 'other', medium: '(not set)' });
  });
  it('classifies search, AI, social and plain referrers without UTM parameters', () => {
    expect(touch('/', 'https://www.google.co.in/search?q=private')).toMatchObject({
      channel: 'organic_search',
      source: 'google',
      medium: 'organic',
      referrerHost: 'www.google.co.in',
    });
    expect(touch('/', 'https://www.bing.com/')).toMatchObject({ source: 'bing' });
    expect(touch('/', 'https://duckduckgo.com/')).toMatchObject({ source: 'duckduckgo' });
    expect(touch('/', 'https://gemini.google.com/app')).toMatchObject({
      channel: 'ai_search',
      source: 'gemini',
      medium: 'ai',
    });
    expect(touch('/', 'https://chatgpt.com/c/1')).toMatchObject({ source: 'chatgpt' });
    expect(touch('/', 'https://www.perplexity.ai/')).toMatchObject({ source: 'perplexity' });
    expect(touch('/', 'https://l.facebook.com/')).toMatchObject({
      channel: 'organic_social',
      source: 'facebook',
    });
    expect(touch('/?fbclid=abc')).toMatchObject({ channel: 'organic_social', source: 'facebook' });
    expect(touch('/', 'https://t.co/x')).toMatchObject({ source: 'x' });
    expect(touch('/', 'https://www.partner.test/blog')).toMatchObject({
      channel: 'referral',
      source: 'partner.test',
      medium: 'referral',
    });
    expect(touch('/')).toMatchObject({ channel: 'direct', source: '(direct)', medium: '(none)' });
  });
  it('ignores internal navigation and never records query or email values', () => {
    expect(touch('/cart', `${site}/catalog`)).toBeUndefined();
    expect(touch('/cart?gclid=1', `${site}/catalog`)).toMatchObject({ channel: 'paid_search' });
    const result = touch(
      '/u/me@example.test?utm_source=me@example.test&utm_term=' + 'x'.repeat(300),
    );
    expect(JSON.stringify(result)).not.toContain('example.test');
    expect(result?.term).toBeUndefined();
    expect(result?.landingPath).toBe('/u/:redacted');
    expect(parseAttribution({ url: 'nope' })).toBeUndefined();
  });
});
