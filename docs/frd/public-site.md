# Public discovery website FRD

2026-10-06; user-authorized implementation amendment.
Sources: [PRD](../PRD.md), [HLD](../ARCHITECTURE.md).

Visitor arrives on an overview, receives a plain definition of SignalKit, supported SDK/runtime use cases and honest limits, then navigates to quickstart/integration answers and source repository. Primary actions open source/getting started; no account/payment/lead flow. State is static: selected nav page and native accessible FAQ content. Search/AEO/GEO content has answer-first definitions, descriptive titles/headings, specific supported/future matrix, visible complete FAQs and source links; no keyword stuffing or artificial ratings.

All routes return full rendered content without JS. Public URLs have unique title/description/canonical, OG/Twitter metadata, initial HTML lang=en, visible breadcrumbs on inner pages, semantic JSONLD matching visible content, sitemap and robots. Homepage links every public page; internal paths work at root/custom domain and GitHub project subpath. 404 not indexable. Optional llms.txt is a human/agent-readable guide, not a search eligibility guarantee.

Display current v1 unpublished status, Next/Bun supported fixtures, vendor verification boundaries, MIT/source link and browser bundle evidence with exclusions. Do not claim universal runtime compatibility, guaranteed delivery/dedup, Sentry replacement or production certification. SDK cannot be installed from npm until release; quickstart must use clone/build/local fixtures and actual package APIs.

Static site needs no analytics scripts, telemetry/consent cookies, API keys, identity or personal-data collection. Native keyboard navigation, responsive layout, readable code/table overflow. Hosting URL supplied by owner or documented engineering default; build metadata follows that URL. Deployment verification checks public status and rendered artifacts after release; local preview is not publication.
