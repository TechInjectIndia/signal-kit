import { describe, expect, it } from 'vitest';
import { classifyReferrerHost } from './attribution.js';
describe('classifyReferrerHost', () => {
  it('recognises search engines, AI assistants and social networks', () => {
    expect(classifyReferrerHost('www.google.co.uk')).toEqual({ kind: 'search', source: 'google' });
    expect(classifyReferrerHost('CHATGPT.COM')).toEqual({ kind: 'ai', source: 'chatgpt' });
    expect(classifyReferrerHost('l.facebook.com')).toEqual({ kind: 'social', source: 'facebook' });
    expect(classifyReferrerHost('partner.example')).toBeUndefined();
    expect(classifyReferrerHost('')).toBeUndefined();
    expect(classifyReferrerHost(undefined)).toBeUndefined();
  });
});
