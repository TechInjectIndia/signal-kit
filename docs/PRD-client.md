# SignalKit — product overview (client PRD)

Status: client-review summary, 29 October 2026. The detailed, binding requirements remain in [PRD.md](PRD.md); this document restates them in plain language and does not change scope.
Owner: SignalKit maintainer team / Sumeet Singh.

## 1. What SignalKit is

SignalKit is a free, open-source toolkit that online stores add to their own website code. It records what shoppers do (pages viewed, products viewed, items added to cart, checkout started, purchases) and sends that information to the marketing and monitoring tools the store already uses — safely, with the shopper's consent, and without breaking checkout if a tool fails.

It is a code library, not a hosted service. There is no SignalKit account, server or dashboard website; everything runs inside the store's own application.

## 2. Why it is needed

- Every ecommerce build repeats the same tracking setup for Google Analytics, Meta (Facebook/Instagram) ads and error monitoring, and each repeat brings the same bugs: double-counted page views, duplicate purchases, missing consent checks, and personal data leaking into reports.
- When tracking breaks, developers spend hours working out which tool received what.
- SignalKit packages a tested, consistent setup once so it can be reused. Priorities, in order: save Tech Inject delivery time, demonstrate agency credibility and attract leads, create revenue opportunities, then earn open-source recognition.

## 3. Who uses it

- **Developers** building or maintaining stores on Next.js, Bun or SvelteKit — the people who install and configure it.
- **Store owners and marketing teams** — they benefit from cleaner, consent-respecting data in Google Analytics and Meta, but do not use SignalKit directly.
- **Tech Inject delivery teams** — reuse it across client projects.
- **Open-source contributors** — improve it through the public repository.

## 4. Main features

1. **Automatic page and request tracking** — page views (including in-app navigation) and website/API calls are recorded once per page, without code on every page.
2. **Standard shopping events** — product viewed, added to cart, checkout started and purchase, checked for correct shape (currency, amounts, quantities) before sending.
3. **Marketing tool connections** — Google Analytics 4, Meta Pixel and Meta's server-side Conversions API, and optionally Microsoft Clarity. A purchase sent from both the browser and the server carries one shared ID so Meta can count it once.
4. **Consent built in** — nothing is sent until the shopper agrees. Analytics, marketing and monitoring are separate choices, all off by default. Withdrawing consent stops future sending; events from before consent are dropped, never saved for later.
5. **Privacy by default** — passwords, keys, form contents, query strings and personal details are kept out of reports. Server keys never reach the browser.
6. **Purchases only from confirmed orders** — a purchase is recorded only when the store's own system has confirmed payment, never just because a "thank you" page loaded. A Razorpay payment example shows how to do this without counting the same order twice.
7. **Technical monitoring** — slow or failing requests can be sent to OpenTelemetry-compatible monitoring tools (such as SigNoz or Grafana) so developers can trace a problem from the browser to the server.
8. **Failure safety** — if a marketing or monitoring tool is down, slow or blocked, the store keeps working; SignalKit gives up within a set time and reports the result.
9. **In-app connections page** — an optional status panel the store can put on its own staff-only page, showing which tools are set up, current consent, and how many sends succeeded, failed or were blocked. It does not prove a tool actually received or credited the data.

## 5. Technology

| Technology                                                          | Purpose                                            |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| TypeScript                                                          | Language the toolkit is written in                 |
| Next.js, Bun, SvelteKit (Node)                                      | Website and server frameworks supported today      |
| Google Analytics 4, Meta Pixel / Conversions API, Microsoft Clarity | Marketing and analytics destinations               |
| OpenTelemetry (OTLP)                                                | Standard format for technical monitoring data      |
| npm                                                                 | Where developers download the toolkit              |
| GitHub and GitHub Pages                                             | Public code, issue tracking and the public website |

## 6. Deliverables

Delivered (published as a test/"alpha" release, version `0.1.0-alpha.2`):

- Nine downloadable packages: the shared core, browser and server parts, and adapters for Next.js, Bun and SvelteKit.
- Working example stores for Next.js, Bun (with the Razorpay payment example) and SvelteKit.
- A public website with an overview, setup guides per platform, integrations and FAQ.
- Developer guides: integration, connections page, upgrading, compatibility and known limits.
- Open-source essentials: licence (MIT), contribution, security and support policies, automated checks and a reviewed release process.

Built but not yet released:

- Sentry error reporting, and documented setup for SigNoz and Grafana in both cloud and self-hosted form, plus matching cards on the connections page. Awaiting review and release approval.

## 7. Delivery stages

1. Foundation, core toolkit, Next.js and Bun support — done.
2. Public website — done.
3. SvelteKit support and the in-app connections page — done.
4. First public alpha releases on npm — done.
5. Sentry/Grafana/SigNoz monitoring support — built, awaiting review and release.
6. Release checks for a stable version (see section 8) — not started; date not set.
7. Further platforms (Hono, Astro, Python/Django, PHP/Laravel) — ideas only, considered after demand is shown; not committed.

## 8. Success checks

Before a stable (non-alpha) release, the owner should be able to confirm:

1. Page views appear exactly once in Google Analytics for first load and for in-app navigation.
2. One confirmed purchase shows as one conversion in Meta even though it is sent from both browser and server, including when the payment notification arrives twice.
3. With consent declined or withdrawn, no marketing data leaves the store.
4. A failing or blocked tracking tool never stops checkout.
5. A developer outside the team can install it from the guides alone; time taken and help needed are recorded.
6. Monitoring data reaches a real SigNoz/Grafana/Sentry account.

Checks 1–4 pass today against simulated tools only. Checks 1, 2, 5 and 6 still need real-account evidence.

## 9. Client inputs and open decisions

- **Test accounts** — Google Analytics, Meta Business and (if wanted) Sentry, Grafana or SigNoz accounts are needed for real-world verification.
- **Stable release** — when to move from alpha to a stable version, and who approves it.
- **Monitoring release** — approval to release the built Sentry/Grafana/SigNoz support.
- **Onboarding trial** — who acts as the outside developer for the setup-time check.
- **Next platforms** — which, if any, future platforms to fund, and on what evidence of demand.
- **Website address** — whether to keep the GitHub Pages address or use a custom domain.

## 10. Scope boundaries

Not included:

- Any hosted service: no SignalKit login, cloud dashboard, data collector or database.
- Consent banners or consent storage — the store supplies the shopper's choice; SignalKit obeys it.
- Taking payments, storing orders or guaranteeing delivery — the store owns its orders, payments and retries.
- Shopper identity or profile features, and advertising networks beyond Google and Meta.
- Guarantees that Google or Meta will credit (attribute) a conversion — that depends on their systems.
- Automatic capture of every browser error; edge/serverless "Edge" runtimes; native Python or PHP versions.

Conditional:

- Microsoft Clarity and technical monitoring are optional and used only when the store turns them on.
- Third-party scripts (Google, Meta, Clarity) collect data under their own rules; the store must configure their privacy and masking settings.
