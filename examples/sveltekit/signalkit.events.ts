import * as z from 'zod/mini';
import { defineEvent, EVENT_NAME_PATTERN } from '@techinject/contracts';

const text = z.string().check(z.minLength(1), z.maxLength(128));
export const phoneClick = defineEvent({
  name: 'phone_click',
  schema: z.object({ channel: z.literal('phone') }),
  map: {
    ga4: { name: 'phone_click', properties: { channel: 'channel' } },
    meta: { name: 'Contact', mode: 'standard', properties: { channel: 'channel' } },
    clarity: { name: 'phone_click' },
  },
});
export const whatsappClick = defineEvent({
  name: 'whatsapp_click',
  schema: z.object({ channel: z.literal('whatsapp') }),
  map: {
    ga4: { name: 'whatsapp_click', properties: { channel: 'channel' } },
    meta: { name: 'Contact', mode: 'standard', properties: { channel: 'channel' } },
    clarity: { name: 'whatsapp_click' },
  },
});
export const customEvent = defineEvent({
  name: 'custom_event',
  schema: z.object({
    action: z.string().check(z.regex(EVENT_NAME_PATTERN)),
    category: z.optional(text),
    label: z.optional(text),
    value: z.optional(z.number().check(z.nonnegative())),
  }),
  map: {
    ga4: {
      name: { from: 'action' },
      properties: { category: 'category', label: 'label', value: 'value' },
    },
    meta: {
      name: { from: 'action' },
      mode: 'custom',
      properties: { category: 'category', label: 'label', value: 'value' },
    },
    clarity: { name: { from: 'action' } },
  },
});
export const exampleEvents = [phoneClick, whatsappClick, customEvent] as const;
