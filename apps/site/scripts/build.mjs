import { platforms, platformPages } from '../src/platforms.mjs';
import { integrationExamples } from '../src/integration-examples.mjs';
import { mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  repository,
  sourceRef,
  pages,
  faq,
  nextExample,
  bunExample,
  purchaseExample,
  guides,
  guideDate,
} from '../src/content.mjs';

pages.push(...platformPages);
const root = fileURLToPath(new URL('../', import.meta.url));
export function siteConfig(
  value = process.env.SITE_URL ?? 'https://techinjectindia.github.io/signal-kit/',
) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  )
    throw new Error(
      'SITE_URL must be an absolute public HTTPS URL without credentials, query or fragment',
    );
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return { url: url.href, base: url.pathname };
}
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s],
  );
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const code = (value, label) =>
  `<figure class="code"><figcaption><span>${escape(label)}</span><button type="button" class="copy-code" data-copy-code hidden aria-label="Copy ${escape(label)} code">Copy</button></figcaption><span class="copy-status" data-copy-status role="status" aria-live="polite"></span><pre><code>${escape(value)}</code></pre></figure>`;
const github = (path, label) =>
  `<a href="${repository}/blob/${path.startsWith('docs/') || path.startsWith('packages/') ? sourceRef : 'main'}/${path}">${label} ↗</a>`;

const workspaceSetup =
  () => `git clone --branch ${sourceRef} https://github.com/TechInjectIndia/signal-kit.git
cd signal-kit
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @signalkit/example-nextjs dev
# Next lab: http://localhost:3100
# In another terminal, from the repository root:
pnpm --filter @signalkit/example-bun dev
# Bun fixture: http://localhost:3200`;
function platformNav(page, link) {
  return `<nav class="platform-tabs" aria-label="Platform integrations">${platforms.map((p) => (p.path ? `<a href="${link(p.path)}"${p.path === page.path ? ' aria-current="page"' : ''}>${escape(p.name)}<small>Alpha</small></a>` : `<span aria-disabled="true">${escape(p.name)} <small>Coming soon</small></span>`)).join('')}</nav>`;
}
function content(page, link) {
  if (page.path === 'guides/')
    return `<header class="page-hero"><p class="eyebrow">Practical field guides</p><h1>Follow the event.<br><em>Keep the evidence.</em></h1><p class="lead">Work through verified purchases, coordinated provider IDs and API tracing with the existing local fixtures.</p></header><section class="guide-list">${guides.map((guide, i) => `<article><p class="eyebrow">0${i + 1} / Implementation guide</p><h2><a href="${link(guide.path)}">${escape(guide.label)} ↗</a></h2><p>${escape(guide.description)}</p><p class="fine">SignalKit maintainers · ${guideDate}</p></article>`).join('')}</section>`;
  if (page.sections)
    return `<header class="page-hero guide-hero"><p class="eyebrow">Implementation guide / ${guideDate}</p><h1>${escape(page.label)}</h1><p class="lead">${escape(page.description)}</p><p class="fine">By SignalKit maintainers · Published <time datetime="${guideDate}">${guideDate}</time> · Unpublished workspace packages</p></header>${page.platform ? platformNav(page, link) : ''}<div class="article-layout"><aside class="contents" aria-label="On this page"><strong>On this page</strong>${page.sections.map((section, i) => `<a href="#section-${i + 1}">${escape(section.title)}</a>`).join('')}<a href="${link('guides/')}">All guides ↗</a></aside><article>${page.sections.map((section, i) => `<section class="article-section" id="section-${i + 1}"><h2>${escape(section.title)}</h2>${section.paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join('')}${section.setup ? code(workspaceSetup(), 'Terminal / existing runnable labs') : ''}${section.code ? code(section.code, section.label) : ''}${section.bullets ? `<ul>${section.bullets.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : ''}${section.links ? `<p>${section.links.map(([url, label]) => `<a href="${escape(url)}">${escape(label)} ↗</a>`).join(' · ')}</p>` : ''}</section>`).join('')}<section class="article-section"><h2>Try it and report what happened</h2><p>Use synthetic data first. Share your framework version, setup step and a sanitized diagnostic in <a href="${repository}/issues">a GitHub issue</a>. A local fixture is not a live provider result.</p><p><a href="${link('guides/')}">Browse all guides ↗</a> · <a href="${link('docs/')}">Choose a platform ↗</a></p></section></article></div>`;

  if (page.path === '')
    return `<section class="hero"><div><p class="eyebrow">Open source / ecommerce telemetry</p><h1>Good signals.<br><em>Less wiring.</em></h1><p class="lead">One consent-aware SDK for the events that matter. Connect your Next.js storefront and Bun API to analytics and observability with a shared, typed vocabulary.</p><div class="actions"><a class="button" href="${link('docs/')}">Choose a platform <span>↗</span></a><a class="text-link" href="${repository}">Explore the source ↗</a></div><p class="fine">MIT licensed · Alpha 0.1.0-alpha.1 · Install from source</p><p><a class="text-link" href="${link('demo.mp4')}">Watch the local demo ↗</a></p></div><aside class="signal-board" aria-label="SignalKit data flow"><div class="board-title">SIGNAL FLOW <span>01 — 03</span></div><div class="source-line"><span>Next.js storefront</span><span>Bun API</span></div><div class="flow-arrow" aria-hidden="true">↓</div><div class="gate"><span class="status-dot"></span> Consent + typed events <small>SignalKit</small></div><div class="flow-arrow" aria-hidden="true">↓</div><div class="routes"><div><span class="eyebrow">Business signals</span><strong>GA4 · Meta</strong><small>Pages and ecommerce events</small></div><div><span class="eyebrow">Technical signals</span><strong>OTLP</strong><small>Requests, status and duration</small></div></div><div class="board-foot">Your hosts. Your providers. Your consent.</div></aside></section><section class="section split"><div><p class="eyebrow">What is SignalKit?</p><h2>A small toolkit.<br>A clearer picture.</h2></div><div><p class="body-large">SignalKit is an open-source ecommerce telemetry SDK for Next.js and Bun. It brings typed business events, automatic page and request instrumentation, and provider adapters together in an embeddable toolkit.</p><p>Keep marketing events and technical telemetry distinct. Use your existing provider accounts; no SignalKit dashboard, account or hosted collector is required.</p></div></section><section class="section"><div class="section-heading"><p class="eyebrow">Built around real work</p><h2>From product view to verified purchase.</h2></div><ol class="feature-list"><li><span>01</span><div><h3>A shared event vocabulary</h3><p>Typed <code>product_view</code>, <code>add_to_cart</code>, <code>begin_checkout</code> and <code>purchase</code> events with runtime validation.</p></div></li><li><span>02</span><div><h3>Routine instrumentation, handled</h3><p>Initial pages and pathname changes, browser fetch/XHR, wrapped Bun requests and configured Next Node OpenTelemetry.</p></div></li><li><span>03</span><div><h3>Consent before dispatch</h3><p>Denied browser defaults, category controls, safe field handling, bounded dispatch and per-provider diagnostics.</p></div></li></ol></section><section class="section evidence"><p class="eyebrow">Measured, with boundaries</p><div class="numbers"><div><strong>33</strong><span>tests recorded in the v1 build</span></div><div><strong>10.6 <small>kB</small></strong><span>gzip browser adapter bundle*</span></div><div><strong>2</strong><span>initial integration targets</span></div></div><p class="fine">* Excludes downloaded vendor scripts and React. Local checks and provider fixtures are not live attribution or production reliability guarantees. ${github('docs/COMPATIBILITY.md', 'Read the evidence')}</p></section><section class="section split"><div><p class="eyebrow">Connect what you already use</p><h2>Provider choice.<br>Without the tangle.</h2></div><div><p class="body-large">GA4, Meta Pixel and CAPI, optional Microsoft Clarity, and OTLP HTTP JSON for your observability collector.</p><p>Next.js and Bun are available in alpha. Coming soon: SvelteKit, Hono, Astro, standalone Node.js, HTML / vanilla JavaScript, Django, Laravel, FastAPI, Spring Boot, Express, NestJS, CodeIgniter, Vue and Angular. These integrations are pending development; no release dates are committed.</p><a class="text-link" href="${link('integrations/')}">See integrations and limits ↗</a></div></section><section class="section split"><div><p class="eyebrow">Practical implementation guides</p><h2>Follow a real<br>integration path.</h2></div><div><p>Start with verified Next.js purchases, share event IDs between Meta Pixel and CAPI, or trace a Bun API with safe route templates. Each guide links to runnable local examples and states the verification limits.</p><a class="text-link" href="${link('guides/')}">Read the technical guides ↗</a></div></section><section class="closing"><p class="eyebrow">Start in your own project</p><h2>Read the code.<br>Try the local lab.</h2><a class="button" href="${link('docs/')}">Get started <span>↗</span></a></section>`;
  if (page.path === 'docs/')
    return `<header class="page-hero"><p class="eyebrow">Platform integrations</p><h1>Your platform.<br><em>Your setup guide.</em></h1><p class="lead">Choose your application platform to install and configure SignalKit. Next.js and Bun are available in alpha; the remaining integrations are coming soon.</p></header>${platformNav(page, link)}<section class="section" id="examples"><h2>Choose an integration</h2><div class="platform-grid">${platforms.map((p) => `<article class="platform-card${p.path ? '' : ' platform-pending'}"><span class="platform-mark"><img src="${link(`logos/${p.logo}.svg`)}" width="36" height="36" alt="" aria-hidden="true"></span><p class="eyebrow">${p.path ? 'Available in alpha' : 'Coming soon'}</p><h3>${p.path ? `<a href="${link(p.path)}">${escape(p.name)} <span aria-hidden="true">↗</span></a>` : escape(p.name)}</h3><p>${escape(p.description)}</p>${p.path ? `<a class="text-link" href="${link(p.path)}">Read integration guide ↗</a>` : '<p class="fine">Development planned · No release date yet</p>'}</article>`).join('')}</div></section><section class="section" id="local"><h2>Start from source</h2><p>Packages are not yet published on npm. Build the workspace, then follow the lab and application wiring in your selected platform guide.</p>${code(`git clone --branch main https://github.com/TechInjectIndia/signal-kit.git\ncd signal-kit\npnpm install --frozen-lockfile\npnpm build`, 'Terminal')}<p>${github('packages/features/signals/INTEGRATION.md', 'Full integration reference')} · ${github('docs/releases/0.1.0-alpha.1.md', 'Local alpha installation plan')}</p></section>`;
  if (page.path === 'integrations/')
    return `<header class="page-hero"><p class="eyebrow">The field guide / 02</p><h1>One vocabulary.<br><em>Your providers.</em></h1><p class="lead">Business signals go to analytics. Request telemetry goes to observability. Choose the adapters your project needs.</p></header><section class="section provider-table"><h2>Provider adapters</h2><div class="table-scroll"><table><caption>Included adapters and configuration boundaries</caption><thead><tr><th>Adapter</th><th>Purpose</th><th>Setup and evidence</th></tr></thead><tbody><tr><th scope="row">Google Analytics 4</th><td>Pages and ecommerce events</td><td>Public measurement ID; disable duplicate history tracking. Browser command fixtures, not live attribution.</td></tr><tr><th scope="row">Meta Pixel + CAPI</th><td>Browser/server commerce copies with stable event IDs</td><td>Pixel ID in browser; token and explicit Graph API version on server. Matching/dedup needs live validation.</td></tr><tr><th scope="row">Microsoft Clarity</th><td>Optional third-party behavior analytics</td><td>Public project ID plus host privacy/masking settings. Script and command fixtures only.</td></tr><tr><th scope="row">OTLP HTTP JSON</th><td>Request traces for your compatible collector</td><td>Host endpoint and credentials. Local transport checks; no live SigNoz deployment proof.</td></tr></tbody></table></div><p>Third-party scripts can observe URLs, DOM and cookies independently. SignalKit consent controls do not replace each provider’s privacy configuration.</p></section><section class="section"><h2>Try an integration example</h2><p><a href="${link('docs/#examples')}">Choose an integration ↗</a> · <a href="${link('guides/')}">Provider and verified-purchase guides ↗</a></section><section class="section"><h2>Runtime compatibility</h2><div class="table-scroll"><table><caption>Current alpha integrations and coming-soon platforms</caption><thead><tr><th>Target</th><th>Status</th><th>Recorded evidence</th></tr></thead><tbody><tr><th scope="row">Next.js App Router / Node</th><td>Available in alpha</td><td>Next 16.3.8, React 19.3.0; production build, browser runtime and local OTel recorder.</td></tr><tr><th scope="row">Bun</th><td>Available in alpha</td><td>Bun 1.3.4 on macOS arm64 plus Linux CI; actual server, tracing and synthetic signed-payment replay tests.</td></tr><tr><th scope="row">Modern browser</th><td>Available in alpha</td><td>Chromium fixture checks; requires modern fetch, crypto and structuredClone APIs.</td></tr><tr><th scope="row">Next Edge</th><td>Deferred</td><td>Not supported or tested; no release date.</td></tr><tr><th scope="row">SvelteKit</th><td>Coming soon</td><td>Framework adapter pending development.</td></tr><tr><th scope="row">Hono</th><td>Coming soon</td><td>Framework adapter pending development.</td></tr><tr><th scope="row">Astro</th><td>Coming soon</td><td>Framework adapter pending development.</td></tr><tr><th scope="row">Node.js (standalone)</th><td>Coming soon</td><td>Generic server integration guide and adapter pending development.</td></tr><tr><th scope="row">HTML / vanilla JavaScript</th><td>Coming soon</td><td>Standalone browser integration and guide pending development.</td></tr><tr><th scope="row">Django (Python)</th><td>Coming soon</td><td>Native Python SDK and framework adapter pending development.</td></tr><tr><th scope="row">Laravel (PHP)</th><td>Coming soon</td><td>Native PHP SDK and framework adapter pending development.</td></tr><tr><th scope="row">FastAPI</th><td>Coming soon</td><td>Dedicated integration and examples pending development.</td></tr><tr><th scope="row">Spring Boot</th><td>Coming soon</td><td>Dedicated integration and examples pending development.</td></tr><tr><th scope="row">Express</th><td>Coming soon</td><td>Dedicated integration and examples pending development.</td></tr><tr><th scope="row">NestJS</th><td>Coming soon</td><td>Dedicated integration and examples pending development.</td></tr><tr><th scope="row">CodeIgniter</th><td>Coming soon</td><td>Dedicated integration and examples pending development.</td></tr><tr><th scope="row">Vue</th><td>Coming soon</td><td>Dedicated integration and examples pending development.</td></tr><tr><th scope="row">Angular</th><td>Coming soon</td><td>Dedicated integration and examples pending development.</td></tr></tbody></table></div><p>${github('docs/COMPATIBILITY.md', 'Read exact compatibility requirements')}</p></section><section class="section split"><div><p class="eyebrow">Keep boundaries clear</p><h2>Best effort telemetry.<br>Host-owned truth.</h2></div><div><p>SignalKit isolates provider failures and bounds dispatch. It does not make event delivery durable. Your host owns verified orders, consent records, an outbox and retry policy where delivery matters.</p><p>SignalKit is not a Sentry replacement: automatic browser exceptions, a hosted issue tracker and a native replay product are outside this v1.</p><a class="text-link" href="${link('faq/')}">Read common questions ↗</a></div></section>`;
  return `<header class="page-hero"><p class="eyebrow">The field guide / 03</p><h1>Clear answers.<br><em>Useful boundaries.</em></h1><p class="lead">What SignalKit does today, how it fits into your project, and where your application remains responsible.</p></header><section class="faq-list">${faq.map(([q, a], i) => `<section id="question-${i + 1}"><h2>${escape(q)}</h2><p>${escape(a)}</p></section>`).join('')}</section><section class="closing"><p class="eyebrow">Still have a question?</p><h2>Start with the source.</h2><a class="button" href="${repository}/issues">Browse issues <span>↗</span></a><p>${github('SUPPORT.md', 'Support guide')} · ${github('SECURITY.md', 'Private security reporting')}</p></section>`;
}

export function render(page, config, notFound = false) {
  const link = (path = '') => `${config.base}${path}`;
  const canonical = new URL(page.path, config.url).href;
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${config.url}#website`,
      name: 'SignalKit',
      url: config.url,
      inLanguage: 'en',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      '@id': `${config.url}#source`,
      name: 'SignalKit',
      description: pages[0].description,
      codeRepository: repository,
      programmingLanguage: 'TypeScript',
      license: `${repository}/blob/main/LICENSE`,
      runtimePlatform: ['Next.js Node runtime', 'Bun'],
      url: config.url,
    },
    {
      '@context': 'https://schema.org',
      '@type': page.sections ? 'Article' : page.path === 'faq/' ? 'FAQPage' : 'WebPage',
      ...(page.sections
        ? {
            headline: page.title,
            author: { '@type': 'Organization', name: 'SignalKit maintainers', url: repository },
            datePublished: guideDate,
            mainEntityOfPage: canonical,
          }
        : {}),
      '@id': `${canonical}#page`,
      url: canonical,
      name: page.title,
      description: page.description,
      inLanguage: 'en',
      isPartOf: { '@id': `${config.url}#website` },
      ...(page.path === 'faq/'
        ? {
            mainEntity: faq.map(([name, text]) => ({
              '@type': 'Question',
              name,
              acceptedAnswer: { '@type': 'Answer', text },
            })),
          }
        : {}),
    },
    ...(page.path
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'SignalKit', item: config.url },
              ...(page.sections
                ? [
                    {
                      '@type': 'ListItem',
                      position: 2,
                      name: page.platform ? 'Documentation' : 'Guides',
                      item: new URL(page.platform ? 'docs/' : 'guides/', config.url).href,
                    },
                  ]
                : []),
              {
                '@type': 'ListItem',
                position: page.sections ? 3 : 2,
                name: page.label,
                item: canonical,
              },
            ],
          },
        ]
      : []),
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}"><meta name="robots" content="${notFound ? 'noindex, follow' : 'index, follow'}">${notFound ? '' : `<link rel="canonical" href="${escape(canonical)}">`}<meta name="theme-color" content="#123c2c"><meta property="og:type" content="${page.sections ? 'article' : 'website'}"><meta property="og:site_name" content="SignalKit"><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${escape(canonical)}"><meta property="og:image" content="${escape(new URL('og-alpha-0.1.0-alpha.1.png', config.url).href)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="SignalKit — Good signals. Less wiring."><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(page.title)}"><meta name="twitter:description" content="${escape(page.description)}"><meta name="twitter:image" content="${escape(new URL('og-alpha-0.1.0-alpha.1.png', config.url).href)}"><link rel="icon" href="${link('favicon.svg')}" type="image/svg+xml"><link rel="stylesheet" href="${link('style.css')}">${notFound ? '' : `<script type="application/ld+json">${json(schema)}</script>`}${!notFound && (page.path === 'docs/' || page.sections) ? `<script src="${link('copy-code.js')}" defer></script>` : ''}</head><body><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><a class="brand" href="${link()}" aria-label="SignalKit home"><span class="brand-mark" aria-hidden="true">s<span>•</span></span>signal<span>kit</span></a><nav aria-label="Main navigation">${pages
    .filter((p) => !p.sections)
    .map(
      (p) =>
        `<a href="${link(p.path)}"${p.path === page.path ? ' aria-current="page"' : ''}>${p.label}</a>`,
    )
    .join(
      '',
    )}<a class="github-link" href="${repository}">GitHub ↗</a></nav></header><main id="main">${page.path && !notFound ? `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="${link()}">SignalKit</a><span aria-hidden="true">/</span>${page.sections ? `<a href="${link(page.platform ? 'docs/' : 'guides/')}">${page.platform ? 'Documentation' : 'Guides'}</a><span aria-hidden="true">/</span>` : ''}<span aria-current="page">${escape(page.label)}</span></nav>` : ''}${notFound ? `<header class="page-hero"><p class="eyebrow">404 / Page not found</p><h1>A missing signal.</h1><p class="lead">This page does not exist. Return to the SignalKit overview or read the quickstart.</p><a class="button" href="${link()}">Back to overview <span>↗</span></a></header>` : content(page, link)}</main><footer class="site-footer"><div><a class="brand" href="${link()}">signal<span>kit</span></a><p>Consent-aware ecommerce telemetry.<br>Open source. Built to embed.</p></div><div class="footer-links"><a href="${repository}">Source code ↗</a><a href="${repository}/blob/main/LICENSE">MIT license ↗</a><a href="${repository}/blob/main/CONTRIBUTING.md">Contribute ↗</a><a href="${repository}/security/advisories/new">Report a vulnerability ↗</a><a href="${link('llms.txt')}">Project summary</a></div><p class="footer-note">Alpha 0.1.0-alpha.1 · Install from source<br>npm release pending · Use your own provider accounts.</p></footer></body></html>\n`;
}

export async function build({ output = resolve(root, 'dist'), siteUrl } = {}) {
  const config = siteConfig(siteUrl);
  if (
    resolve(output) === resolve(root) ||
    resolve(root).startsWith(`${resolve(output)}/`) ||
    ['src', 'scripts', 'public', 'test'].some((name) => resolve(output) === resolve(root, name))
  )
    throw new Error('Output must not replace source directories');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const page of pages) {
    const directory = resolve(output, page.path);
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'index.html'), render(page, config));
  }
  await writeFile(
    resolve(output, '404.html'),
    render(
      {
        path: '404.html',
        title: 'Page not found — SignalKit',
        description: 'Return to the SignalKit overview or quickstart.',
        label: 'Not found',
      },
      config,
      true,
    ),
  );
  await cp(resolve(root, 'src/style.css'), resolve(output, 'style.css'));
  await cp(resolve(root, 'public'), output, { recursive: true });
  await writeFile(resolve(output, '.nojekyll'), '');
  await writeFile(
    resolve(output, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((p) => `<url><loc>${escape(new URL(p.path, config.url).href)}</loc></url>`).join('')}</urlset>\n`,
  );
  await writeFile(
    resolve(output, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${config.url}sitemap.xml\n`,
  );
  await writeFile(
    resolve(output, 'llms.txt'),
    `# SignalKit\n\n> Open-source, consent-aware ecommerce telemetry SDK for Next.js and Bun.\n\nAlpha 0.1.0-alpha.1 is available from source and local tarballs; npm publication is pending. Marketing events and technical telemetry use separate destinations. Browser consent defaults to denied. Host applications own verified purchases, consent and durable retries.\n\n## Guides\n${pages.map((p) => `- [${p.label}](${new URL(p.path, config.url).href}): ${p.description}`).join('\n')}\n- [Source and license](${repository}): MIT licensed TypeScript workspace.\n- [Compatibility evidence](${repository}/blob/${sourceRef}/docs/COMPATIBILITY.md): Local runtime and fixture checks; no live attribution guarantees.\n\n## Boundaries\nNext Node and Bun are first targets. Next Edge is unsupported. Other framework and native Python/PHP adapters are future work. No hosted dashboard or automatic browser exception capture. GA4, Meta Pixel/CAPI, optional Clarity and OTLP HTTP JSON adapters are included. This summary does not guarantee discovery or use by AI systems.\n`,
  );
  return { output, config };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await build();
  console.log(`Static site built: ${result.output}\nCanonical: ${result.config.url}`);
}
