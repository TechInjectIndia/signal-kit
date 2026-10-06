# Public site operation

Live site: [SignalKit](https://techinjectindia.github.io/signal-kit/), verified2026-10-06.

Source: apps/site. Static HTML/CSS, complete dist output, one small local progressive-enhancement script for code-copy buttons on documentation pages; no external font/script requests. Content remains readable and navigable without JavaScript. The local SDK labs remain noindex.

## Build and preview

```sh
pnpm --filter @signalkit/site build
pnpm --filter @signalkit/site dev
# http://localhost:3300/signal-kit/
```

Set SITE_URL to the final HTTPS URL before building, including project path and trailing slash. The owner selected https://techinjectindia.github.io/signal-kit/ on 2026-10-06. Deployment evidence is recorded in the public-site report; a configured URL alone is not evidence of publication. Every canonical, sitemap URL, internal link and social-image URL follows it. For a custom domain set SITE_URL=https://your-domain.example/ and configure its DNS/hosting separately; no hardcoded machine path. The site deploys from dist to any static host.

## Discovery and content

Four complete pages: overview, docs/quickstart, integrations, FAQs. Answer-first definitions/use cases, visible FAQs, current support matrix and repository source links help readers and answer engines understand the project. Metadata includes unique title/description/canonical, OG/Twitter and valid semantic JSONLD; robots/sitemap are generated. No artificial ratings, testimonials or pricing promises. llms.txt is optional explanatory content, not a required ranking mechanism.

[Google AI-feature guidance](https://developers.google.com/search/docs/appearance/ai-features) applies ordinary search foundations; structured data must match visible content. Search visibility and AI citations require public crawlable publication and are not guaranteed by markup. For GitHub project sites, robots.txt resides under the project path; user.github.io/robots.txt at the origin is GitHub's/owner-site policy. The project sitemap remains directly available for Search Console submission.

## Release and upkeep

Review rendered pages at desktop/mobile, verify links and truthful claims, run app tests and workspace checks. Keep docs content/compatibility/source links synchronized when SDK APIs or published package status changes. Generate social PNG from checked-in source; commit both for portable builds. The owner selected GitHub Pages. After verifying and committing the source, run pnpm site:publish to update the dedicated generated branch. The publisher refuses other repositories and unmanaged existing branches. Enable Pages once with gh-pages root as source; later pushes rebuild automatically. No Search Console account verification or sitemap submission is claimed unless performed with owner access.

GitHub Pages can publish static output via a dedicated gh-pages source branch without merging SDK PR3; source-site PR remains reviewable. A publish is separate from npm release. Verify public HTTPS overview/inner pages/assets/sitemap after deployment before calling it live.
