import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, siteConfig } from '../scripts/build.mjs';
import { pages, faq, guides, guideDate, sourceRef } from '../src/content.mjs';

test('public canonical configuration rejects credential and non-public formats', () => {
  assert.equal(siteConfig('https://techinjectindia.github.io/signal-kit/').base, '/signal-kit/');
  assert.equal(siteConfig('https://signals.example').url, 'https://signals.example/');
  for (const value of [
    'http://example.com',
    'https://u:p@example.com/',
    'https://example.com/?secret=x',
    'https://localhost/',
    'https://example.com/#x',
  ])
    assert.throws(() => siteConfig(value));
});
for (const siteUrl of ['https://techinjectindia.github.io/signal-kit/', 'https://signals.example/'])
  test(`crawlable output and schemas: ${siteUrl}`, async () => {
    const output = await mkdtemp(join(tmpdir(), 'signal-site-'));
    try {
      const { config } = await build({ output, siteUrl });
      const canonicals = new Set();
      const social = await readFile(join(output, 'og.png'));
      assert.equal(social.readUInt32BE(16), 1200);
      assert.equal(social.readUInt32BE(20), 630);
      for (const page of pages) {
        const html = await readFile(join(output, page.path, 'index.html'), 'utf8');
        assert.match(html, /^<!doctype html><html lang="en">/);
        assert.equal((html.match(/<h1>/g) || []).length, 1);
        assert.match(html, /content="index, follow"/);
        assert.match(html, /href="#main"/);
        const canonical = html.match(/rel="canonical" href="([^"]+)"/)[1];
        assert.equal(canonical, new URL(page.path, siteUrl).href);
        canonicals.add(canonical);
        const schemas = JSON.parse(html.match(/application\/ld\+json">(.*?)<\/script>/s)[1]);
        assert.ok(
          schemas.some(
            (s) => s['@type'] === 'SoftwareSourceCode' && s.codeRepository.endsWith('/signal-kit'),
          ),
        );
        if (page.path) {
          assert.ok(schemas.some((s) => s['@type'] === 'BreadcrumbList'));
          assert.match(html, /aria-label="Breadcrumb"/);
        }
        if (page.path === 'faq/') {
          const data = schemas.find((s) => s['@type'] === 'FAQPage');
          assert.equal(data.mainEntity.length, faq.length);
          for (const question of data.mainEntity)
            assert.ok(html.includes(question.acceptedAnswer.text));
        }
        assert.equal((html.match(/<script/g) || []).length, 1, 'only inert structured data script');
        assert.doesNotMatch(html, /https:\/\/(?:fonts|cdn)\./);
        for (const [, href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
          if (href.startsWith('#')) {
            assert.ok(html.includes(`id="${href.slice(1)}"`));
            continue;
          }
          if (!href.startsWith(config.base)) continue;
          const [path, fragment] = href.slice(config.base.length).split('#');
          const target = join(
            output,
            path.endsWith('/') || path === '' ? `${path}index.html` : path,
          );
          await access(target);
          if (fragment) assert.ok((await readFile(target, 'utf8')).includes(`id="${fragment}"`));
        }
        assert.match(html, /og:image.*?og\.png/);
        assert.doesNotMatch(html, /blob\/9f07183/);
        if (page.path === 'docs/')
          assert.ok(html.includes('/blob/main/packages/features/signals/INTEGRATION.md'));
      }
      assert.equal(canonicals.size, pages.length);
      const sitemap = await readFile(join(output, 'sitemap.xml'), 'utf8');
      for (const page of pages) assert.ok(sitemap.includes(new URL(page.path, siteUrl).href));
      assert.ok(!sitemap.includes('404'));
      assert.ok(
        (await readFile(join(output, 'robots.txt'), 'utf8')).includes(`${siteUrl}sitemap.xml`),
      );
      assert.match(await readFile(join(output, '404.html'), 'utf8'), /content="noindex, follow"/);
      assert.ok(
        (await readFile(join(output, 'docs/index.html'), 'utf8')).includes(
          `git clone --branch ${sourceRef}`,
        ),
      );
      assert.equal(sourceRef, 'main', 'source links follow merged SDK main');
      assert.equal(
        pages.length,
        8,
        'overview, docs, integrations, FAQ, guides index and three articles',
      );
      for (const guide of guides) {
        const html = await readFile(join(output, guide.path, 'index.html'), 'utf8');
        const schema = JSON.parse(html.match(/application\/ld\+json">(.*?)<\/script>/s)[1]);
        const article = schema.find((item) => item['@type'] === 'Article');
        assert.equal(article.headline, guide.title);
        assert.equal(article.author.name, 'SignalKit maintainers');
        assert.equal(article.datePublished, guideDate);
        assert.equal(article.mainEntityOfPage, new URL(guide.path, siteUrl).href);
        assert.equal(
          schema.find((item) => item['@type'] === 'BreadcrumbList').itemListElement.length,
          3,
        );
        assert.match(html, /og:type" content="article/);
        assert.ok(html.includes(`git clone --branch ${sourceRef}`));
        assert.ok(guide.sections.length >= 6);
      }
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
