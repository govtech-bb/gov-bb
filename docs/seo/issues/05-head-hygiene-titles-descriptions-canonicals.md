# Head hygiene: title suffix, hub descriptions, missing canonicals, utility noindex, 404 title

## Problem

`pageHead()` exists but only some routes use it:

- 59 of 247 crawled pages have no `| Government of Barbados` suffix (every
  content page, category and subcategory served by `$.tsx`). Search engines
  pad those titles with the header logo's alt text — results read "Register a
  birth - Go to alpha.gov.bb".
- All 12 category hubs and 5 subcategory hubs have no `<meta
name="description">` (only `og:description`), and hubs are 37–47 words.
- No canonical on `/bank-holiday-calendar`, the three emergency-shelter routes,
  `/feedback`, `/tell-us`, `/business-trade/crop-over-permits/form`.
- `/service-unavailable` and `/javascript-required` are indexable 200s;
  `/tell-us` has no h1 and no text (a Tally iframe).
- The 404 page carries the homepage title; 12 crawled URLs share it.
- `/start` pages are indexable and self-canonical although they duplicate the
  parent's title, are due to be removed, and 404 whenever a form is flagged
  off; 14 of them earned 454 clicks last quarter that the parent pages should
  absorb.

## Impact

Rewritten titles and missing descriptions cost clicks on pages that already
rank; missing canonicals feed the "duplicate without user-selected canonical"
failures in Search Console; empty and utility pages waste crawl on a small
site.

## Where

- `apps/landing/src/lib/page-head.ts` (`seoTags`, `pageHead`)
- `apps/landing/src/routes/$.tsx` `head()` (lines ~200–258)
- `apps/landing/src/routes/__root.tsx` `head()` (lines ~123–164)
- `apps/landing/src/routes/bank-holiday-calendar/index.tsx`,
  `health-and-emergency-services/find-an-emergency-shelter/{index,find,guidance}.tsx`
  (paths exported from `-lib/routes.ts`), `feedback.tsx`, `tell-us.tsx`,
  `service-unavailable.tsx`, `javascript-required.tsx`,
  `business-trade/crop-over-permits/form.tsx`

Router mechanics that shape the change (`@tanstack/router-core` 1.171):
`HeadContent` uses the deepest route's title, dedupes `meta` by
name/property, and concatenates `links` — so exactly one route may emit the
canonical. On `notFound()` from `$`, only the root `head()` runs, with
`match.globalNotFound === true`.

## Fix

1. `page-head.ts`: emit the `description` meta only when non-empty.
2. `$.tsx`: all three branches call `pageHead()`:
   - page: `pageHead(title, description ?? '', { noindex: !isPublic, path:
`/${page.url}` })` plus the JSON-LD scripts when public;
   - subcategory: `pageHead(sub.title, sub.description ?? '', { path })` (drop
     the `| Category` segment; the H1 is the subcategory title);
   - category: `pageHead(cat.title, cat.description ?? '', { path })`.
     `/start` pages: `noindex` and no canonical/OG/JSON-LD —
     `isPublic = level === 'public' && !page.slug.endsWith('/start')` in the page
     branch; they stay out of the sitemap.
3. Routes without a canonical: pass `{ path }` to `pageHead` — bank holidays
   uses the base path regardless of `?year=` (issue 04 refines this),
   shelters use `META.url` / `EMERGENCY_SHELTER_FIND_HREF` /
   `EMERGENCY_SHELTER_GUIDANCE_HREF`, `/feedback` and `/tell-us` their own
   paths.
4. `service-unavailable.tsx`, `javascript-required.tsx`: add `{ name:
'robots', content: 'noindex' }`. `/tell-us`: noindex until it has
   server-rendered content (it is also orphaned and its Tally script is
   blocked by the CSP).
5. `__root.tsx`: `head: ({ match }) => …` with title `Page not found |
Government of Barbados` and `robots noindex` when `match.globalNotFound`.
6. Hub titles: with the suffix, one-word hubs ("Housing", "Education") become
   acceptable; consider `Housing services` as the H1/title in the taxonomy for
   intent match (content decision).

`/start` handling depends on the team decision below; the code above shows
Option A.

## Decision needed: what to do with `/start` pages

Facts: 14 `/start` URLs are indexable and self-canonical today. Last quarter
they earned 454 clicks from 6,762 impressions (the birth-certificate start
alone 259 clicks at position 4.2). They repeat the parent's exact title,
13 have no description, they are excluded from the sitemap, and they return
404 whenever their form is flagged off — three certificate starts are 404 right
now. Start pages are planned for removal, with the Start button living on the
entry page.

### Option A — never index start pages (proposed)

- **What:** `noindex` and no canonical/OG/JSON-LD on every `/start`
  (`isPublic = level === 'public' && !page.slug.endsWith('/start')` in the
  `$.tsx` page branch); keep them out of the sitemap. While a form is flagged
  off, the start page **302s to its parent**; when start pages are removed,
  **301** to the parent.
- **Pros:** one indexable URL per service (the entry page), so no duplicate
  titles and no two URLs competing for the same query; matches the removal
  plan, so nothing has to be undone later; no title/description work on 13
  transitional pages; the same split GOV.UK uses (guidance page indexable,
  transactional step not).
- **Cons:** Google drops the 14 URLs over a few weeks; their ~450
  clicks/quarter have to transfer to the parents. The parents already rank
  at positions 4–5 for the same intent, so most of it should carry over, but a
  short-term dip is possible.
- **Work:** `$.tsx` head condition, loader redirect for hidden `/start`,
  tests (issues 05 and 01). Issues 08 and 09 stay as written.

### Option B — keep start pages indexable, but they must never 404

- **What:** keep `/start` indexable; give each a distinct title (for example
  "Start now: Get a copy of a birth certificate") and a description; add them
  to the sitemap; when the form is flagged off, return **200 with the status
  banner and no Start button** (the behaviour of the first version of feature
  flagging, which hid the start page but kept the page), or 302 to the parent.
- **Pros:** keeps the clicks the start URLs already earn with no transfer
  risk; least disruption to current rankings.
- **Cons:** two URLs per service keep competing; 13 titles and descriptions to
  write for pages that will be removed; duplicated `GovernmentService` JSON-LD
  to fix on the start page; when the pages are eventually removed a 301 to the
  parent is still needed, so the ranking transfer happens then anyway.
- **Work:** `$.tsx` head (title and description per start page), sitemap
  inclusion (issue 08 step 4 reversed), the 200-with-banner path in the loader
  (issue 01), descriptions for 13 files (issue 09), tests.

### Either way

A hidden start page must never return 404 (issue 01). The remaining choice is
whether the start URL is a page in its own right (B) or a step that hands off
to the entry page (A).

| Affects                      | Option A                       | Option B                                        |
| ---------------------------- | ------------------------------ | ----------------------------------------------- |
| `$.tsx` head for `/start`    | `noindex`, no canonical        | suffixed distinct title, description, canonical |
| Sitemap (issue 08)           | excluded (as today)            | included with `lastmod`                         |
| Descriptions (issue 09)      | none needed                    | 13 to write                                     |
| JSON-LD (issue 11)           | none on `/start`               | `WebPage` only, no `GovernmentService`          |
| Flagged-off form (issue 01)  | 302 to parent                  | 200 + banner, Start hidden                      |
| Removal of start pages later | 301 to parent, already planned | 301 to parent, rankings move then               |

Proposed: **Option A**, because the pages are transitional. Choose B only if
start pages are staying for the long term.

## Acceptance criteria

- Every 200 page in the crawl has a title ending `| Government of Barbados`,
  exactly one canonical, and a non-empty description (hubs included).
- `/service-unavailable`, `/javascript-required`, `/tell-us` carry `noindex`.
- The 404 page's title is `Page not found | Government of Barbados`.
- Every `/start` page carries `noindex` and no canonical.
- New `apps/landing/src/routes/-content-head.test.ts` (real registry,
  `Route.options.head({ loaderData })`) covers page, category, subcategory
  and `/start`; `lib/page-head.test.ts` covers the empty-description case;
  `-root-context.test.ts` covers `globalNotFound`.
- Re-crawl shows 0 pages without suffix, 0 hubs without description.

Suggested labels: `enhancement`, `severity:important`, `area:frontend`, `subsystem:landing`
