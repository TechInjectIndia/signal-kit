import { createSignals, defineEvent } from '../src/index.js';
import { z } from '../../contracts/test/consumer-events.js';
const help = defineEvent({
  name: 'help_open',
  schema: z.object({ section: z.string() }),
  map: { ga4: { name: 'help_open', properties: { section: 'section' } } },
});
const signals = createSignals({ events: [help] });
void signals.track({ name: 'help_open', properties: { section: 'intro' } });
void signals.track({ name: 'page_view', properties: { page_path: '/' } });
// @ts-expect-error Registered event properties are inferred from its schema.
void signals.track({ name: 'help_open', properties: { section: 123 } });
// @ts-expect-error Consumer names must be registered at the root.
void createSignals().track({ name: 'help_open', properties: { section: 'intro' } });
// @ts-expect-error The removed custom_event name is not a predefined event.
void createSignals().track({ name: 'custom_event', properties: { action: 'video_play' } });
defineEvent({
  name: 'bad_projection',
  schema: z.object({ section: z.string() }),
  // @ts-expect-error Projection sources must be declared schema keys.
  map: { ga4: { name: 'bad_projection', properties: { label: 'unknown' } } },
});
