# Internal linking and hub pages

## Problem

- `/services` (the only A–Z list) filters on `stage === 'alpha'`, so feature
  pages (bank holidays, emergency shelters, water outages), StormReady and
  the root information pages are missing from it.
- The footer links only Home, Terms & Conditions and Careers; no category,
  contact, accessibility or privacy links.
- Orphans (no inbound link from any crawled page): `/tell-us`,
  `/whats-changing`, `/javascript-required`, `/service-unavailable`, the
  pension information pages, and 42 pharmacy detail pages.
- Category hubs are 37–47 words: an h1, a link list and "Was this helpful?",
  which is why every hub's heading outline skips h1 → h3. Subcategory hubs
  with no visible services return a 200 "No services yet." (15 soft 404s in
  Search Console).
- `MarkdownLink` opens internal links in a new tab (user-experience note; it
  also hides referrer paths in analytics).

## Impact

Marriage/death certificate pages average position 21 despite good CTR when
shown; business-licence pages (14 of them) earned 5 clicks on 553
impressions; feature pages are reachable only from the home page's Featured
column or the sitemap.

## Where

- `apps/landing/src/routes/services.tsx` (filter)
- `apps/landing/src/routes/__root.tsx` footer (lines ~22–34)
- `apps/landing/src/routes/$.tsx` `ServiceListView` / `SubcategoryIndexView`
- `apps/landing/src/components/markdown/MarkdownLink.tsx`
- `apps/landing/src/routes/health-and-emergency-services/find-an-open-pharmacy/-ui/find-page.tsx`

## Fix

1. `/services`: list every public registry page that is not a sub-page
   (drop the `stage` filter or give `-meta` pages a stage); group by category
   with h2s.
2. Footer: the visible categories, `/services`, `/feedback`, and the trust
   pages from issue 13 when they exist.
3. Hubs: a short intro paragraph from the taxonomy description, h2 groupings
   (e.g. "Certificates", "Registrations") where a category has more than ~8
   services, and a "Related" block on service pages linking siblings in the
   same category (server-rendered).
4. Empty subcategory hubs: 404 (never published for the public) or hide the
   link and omit from the sitemap (issue 08).
5. Pharmacy finder: server-rendered A–Z of confirmed pharmacies (issue 08).
6. `MarkdownLink`: same-tab for internal links.

## Acceptance criteria

- Every public page has at least one inbound link from a hub, the A–Z list or
  a related block (crawl orphan count 0 excluding utility pages).
- `/services` lists feature and information pages.
- Hubs have an h2 level; heading-skip count in the crawl drops to the content
  files listed in issue 09.

Suggested labels: `enhancement`, `severity:minor`, `area:frontend`, `subsystem:landing`
