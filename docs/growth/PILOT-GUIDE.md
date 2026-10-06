# Five-developer pilot

## Who qualifies

Recruit five developers with a real ecommerce project using Next.js App Router on Node, Bun, or both. Prefer a mix of independent developers and small agencies. They must be able to run synthetic fixtures locally, identify a concrete tracking need and provide candid feedback. Unsupported frameworks and users seeking a hosted analytics dashboard are outside this pilot.

The maintainer first needs an actual project owner and five willing participants. Do not invent names, outreach status or installations. An invitation should explain the unpublished status, ask permission to run a local trial, and avoid promises about attribution or compatibility beyond [recorded evidence](../COMPATIBILITY.md).

## Invitation draft

> I am testing SignalKit, an open-source consent-aware ecommerce tracking SDK for Next.js and Bun. It currently runs from source with local fixtures. Would you try its quickstart on a synthetic project and tell me where setup becomes confusing? I can assist, but we will record assisted and independent setup separately. No customer data or production credentials are needed. There is no commitment to keep using it.

Select the recipient and sending account before sending. Adapt the invitation to their actual project rather than sending a bulk message.

## Reproducible setup trial

1. Record a UTC start timestamp, source commit, OS, Node/pnpm/Bun versions and selected host. Use a participant/project alias, not client names or personal details. Log every assistance interval separately.
2. Use the current [README quickstart](../../README.md) and [integration guide](../../packages/features/signals/INTEGRATION.md). Clone the repository; run the pinned install and build commands. Until a verified registry release exists, do not use an advertised npm installation command.
3. Start the relevant local lab. Confirm the Next lab begins with consent denied, then grant the needed categories. Observe initial/navigation page events and an API request in the local inspector/recorder.
4. Exercise product view, cart and checkout with synthetic values. Exercise the signed payment fixture and replay/restart path for a verified purchase. A browser checkout success screen is not purchase proof.
5. Withdraw consent and record what stops. Verify that diagnostics do not contain credentials, raw customer data or request bodies.
6. Record the finish timestamp when the participant can explain where page/business events and technical requests go. Measure elapsed setup minutes from timestamps and assisted minutes from actual help. Note blocked steps, error text after redaction and documentation locations.
7. Ask whether they would integrate it into an actual authorized host. At day 14, confirm whether it remains enabled and useful; do not infer retention from an unanswered message.

Local fixtures prove behavior in the fixture only. Record live provider verification as a separate activity with host authorization and private credentials; provider acceptance alone does not establish delivery, attribution or deduplication. Record an untested provider as untested.

## Measure internal savings honestly

Before integration, list the repeated work the current project needs: consent wiring, typed commerce events, provider mapping, trace correlation and diagnostics. Record actual effort on a comparable previous integration only if evidence exists. If no comparable baseline exists, record current setup time and a qualitative observation; do not calculate a savings percentage.

Report assistance, debugging, maintenance and host-specific work alongside setup time. Separate SDK configuration from payment verification, durable storage and consent decisions owned by the host.

## Data handling

Use synthetic fixtures throughout public reproduction. Keep private working notes outside the public repository. Publish aggregates or participant-approved aliases only; do not commit identifiable leads, client names, order identifiers, payloads, emails, screenshots containing secrets or private feedback. Obtain permission for any attributable quote or client case study before publication.

## Scorecard fields

[SCORECARD.csv](SCORECARD.csv) records observation date, alias, runtime/source, timestamps, measured minutes, installation outcome, 14-day retention, external contribution, qualified lead, weekly maintenance time and secondary star observations. Empty means unknown; write `yes` or `no` only after verification. A qualified lead requires a real stated need and permission to follow up, not a star or visit. An external contribution requires a linked issue/PR from someone outside the maintainer team.
