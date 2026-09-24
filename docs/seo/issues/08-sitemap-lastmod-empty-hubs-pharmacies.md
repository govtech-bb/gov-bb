# Sitemap: no `lastmod`, empty subcategory hubs listed, 42 unlinked pharmacy pages

## Problem

`/sitemap.xml` (223 URLs) emits only `<loc>` and `<priority>`. 115 of 116
content pages carry a `publish_date` that the page already shows as "Last
updated on", but the sitemap never tells crawlers what changed. Every
subcategory of a visible category is listed even when it has no visible
services (a 200 "No services yet." page — Search Console shows 15 soft 404s).
163 pharmacy detail pages are listed; 42 of them (`pppStatus: unconfirmed`, no
opening hours) are linked from nowhere on the site and hold ~200 words.

## Impact

Slower re-crawl of updated guidance; crawl budget on a small site spent on
empty hubs and unconfirmed pharmacy pages, which likely make up much of the
213 "discovered/crawled – currently not indexed" URLs.

## Where

- `apps/landing/src/lib/sitemap.ts` (`collectSitemapEntries`, `buildSitemapXml`)
- `apps/landing/src/routes/sitemap[.]xml.ts`
- `apps/landing/src/routes/health-and-emergency-services/find-an-open-pharmacy/-data/pharmacies.json`,
  `$slug.tsx`, `-ui/pharmacy-finder.tsx`
- `apps/landing/src/lib/frontmatter.ts` (`publish_date`, `z.coerce.date()`)

## Fix

1. `SitemapEntry.lastmod?: string`; for registry pages
   `page.frontmatter.publish_date?.toISOString().slice(0, 10)`; write
   `<lastmod>` before `<priority>`. Feature `-meta.ts` pages have no date and
   get none.
2. Emit a subcategory only when `categoryServices(cat.slug, 'public',
overlay)` contains a page with that `subcategory`; the same check can
   replace `isCategoryVisible` for the category itself.
3. Pharmacies: exclude entries with `pppStatus: 'unconfirmed'` or no hours
   from the sitemap and give their detail pages `noindex` until confirmed; or
   render a server-side A–Z list of all pharmacies on the finder page so every
   detail page has an inbound link. Prefer the first (thin pages should not be
   in the index) plus the A–Z list for the confirmed ones.
4. Keep `/start` pages out of the sitemap (they are noindexed; issue 05).
5. After deploy, resubmit the sitemap in Search Console.

## Acceptance criteria

- `lib/sitemap.test.ts`: `lastmod` present for a dated page and absent
  otherwise; an overlay that enables only `entrepreneurship-business` yields
  `/youth-and-community/entrepreneurship-business` but not
  `/youth-and-community/arts-culture`; unconfirmed pharmacies absent.
- `xmllint --noout` passes on the live sitemap; every listed URL returns 200
  with a self-canonical.
- Search Console soft-404 count drops; "discovered – not indexed" reviewed
  after the per-reason export.

Suggested labels: `enhancement`, `severity:minor`, `area:frontend`, `subsystem:landing`
