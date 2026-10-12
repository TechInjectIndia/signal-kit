import { createSvelteKitHooks } from '@techinject/sveltekit-server';
import { records } from './lib/server/records.js';
const hooks = createSvelteKitHooks(() => ({
  consent: { analytics: false, marketing: false, observability: true },
  excludeUrls: ['/api/records'],
  traceOrigins: ['http://127.0.0.1:3400'],
  observer: {
    record(record) {
      records.push(record);
      if (records.length > 100) records.shift();
    },
  },
}));
export const handle = hooks.handle;
export const handleFetch = hooks.handleFetch;
