# Old-site URLs still rank and return 404

## Problem

The previous alpha site's URLs are still in Google's index and still earn
impressions: 144 `/government/organisations/*` URLs (8,083 impressions, 93
clicks last quarter), `/welfare-department` (770 impressions), old root-level
slugs such as `/register-summer-camp`, and 67 URLs on the `www.` host. All
return a bare 404. Search Console lists 583 "Not found (404)" pages.

People are looking for exactly this content: "ministry of education barbados"
(765 impressions, 3 clicks), "barbados licensing authority" (334, 0), "caipo
barbados" (157, 0), "barbados treasury" (141, 0), "grantley adams
international airport" (110, 0), "queen elizabeth hospital" and similar all
land on a 404 for the old organisation page.

## Impact

About 11,000 impressions a quarter reach dead URLs; the organisation-page
demand alone is ~8,000. Every one is a lost visit and a signal to Google that
the domain is decaying.

## Where

- Old URL patterns: `/government/organisations/<slug>`, `/<department-slug>`
  (e.g. `/welfare-department`), `www.alpha.gov.bb/*`.
- `apps/landing/src/routes/$.tsx` loader: falls through to `notFound()` after
  the bare-slug redirect (`resolveBareSlugRedirect`, `content/registry.ts`).
- Organisation pages exist on branch `preview-government-organisations`
  (noindex) — not on `main`.

## Fix

1. Export Search Console → Pages → "Not found (404)" (583 URLs) and rank by
   impressions.
2. Build a small static redirect map, `apps/landing/src/lib/legacy-redirects.ts`
   (old path → new path or external URL), consulted in `$.tsx` immediately
   before `notFound()`:
   - old organisation page → the new organisation page once those ship at the
     same path pattern; until then, 301 to the department's page on
     `www.gov.bb` where one exists (a cross-domain 301 to the same
     government's authoritative page is legitimate; a redirect to `/services`
     would be treated as a soft 404).
   - old department slugs (`/welfare-department`) → the matching service or
     category page (`/money-financial-support/apply-financial-assistance`).
   - old service slugs → already handled by the bare-slug 301; extend the map
     for renamed slugs.
3. Everything else in the export that has no equivalent: return **410** with
   an explanation page (see issue 01) rather than 404, so Google drops it
   faster and users get a next step.
4. Relaunch the organisation pages at `/government/organisations/<slug>`
   preserving the old slugs (or mapping them). This is the single largest
   recoverable pool of demand on the property.
5. Fix the `www.` host separately (issue 03).

## Acceptance criteria

- Every old URL with ≥ 50 impressions in the export returns 301 or 410, none
  return 404.
- The redirect map has a unit test (old path → expected target) and the
  `$.tsx` loader test covers a mapped path.
- Search Console "Not found (404)" count falls below 100 within a month of
  deployment; "ministry of education barbados" no longer lands on a 404.

Suggested labels: `enhancement`, `severity:important`, `area:frontend`, `subsystem:landing`
