# Flagged-off services return 404 on URLs that rank

## Problem

When a service is switched off at runtime (`service_status: disabled`, or a
form missing from the live forms list), its public URLs return HTTP 404. The
guidance page for the primary-school textbook grant and the `/start` pages for
birth, marriage and death certificates all 404 today while their parent pages
show "This form is currently being upgraded". Google still ranks those URLs
(positions 3–7), so searchers land on a 404 and the pages will be dropped from
the index; when the flag flips back, ranking has to be rebuilt from scratch.

For `/start` pages two options are on the table (issue 05, "Decision
needed"): never index them and redirect a hidden one to its parent, or keep
them indexable and serve 200 with the status banner when the form is off.
Under either option a start page never returns 404.

Bare-slug redirects have the same gap: `/get-a-primary-school-textbook-grant`
(39 clicks last quarter) now 404s instead of redirecting, because the target
page is hidden.

## Impact

Last quarter (Search Console, 2026-06-22 to 2026-09-21):

| URL                                                            | Clicks | Impressions | Position | Today |
| -------------------------------------------------------------- | -----: | ----------: | -------: | ----- |
| `/family-birth-relationships/get-birth-certificate/start`      |    259 |       2,960 |      4.2 | 404   |
| `/money-financial-support/get-a-primary-school-textbook-grant` |    156 |         815 |      3.5 | 404   |
| `/family-birth-relationships/get-marriage-certificate/start`   |     57 |       1,390 |      6.9 | 404   |
| `/family-birth-relationships/get-death-certificate/start`      |     30 |         732 |      6.6 | 404   |

That is 502 clicks and 5,900 impressions, 9 % of all clicks in the period,
landing on "We couldn't find that page".

## Where

- `apps/landing/src/routes/$.tsx` loader: `notFound()` for hidden pages and
  for a public `/start` page whose form is not in the live list (around lines
  96–198; the `/start` check is around 151–157).
- `apps/landing/src/lib/service-status.ts` `deriveVisibilityOverlay`: maps
  `disabled` to hidden.
- `apps/landing/src/lib/sitemap.ts`: drops hidden pages.
- `docs/decisions/0063-service-status-overrides-static-visibility.md`: the
  decision that `disabled` means 404 + noindex + out of the sitemap.

## Fix

Adopt GOV.UK's unpublishing semantics, which never let published content fall
to a bare 404:

| State                                            | Response                                                                                                         | Use for                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Paused ("being upgraded", seasonal, maintenance) | **200** with the status banner, Start button hidden, page stays in the sitemap and indexable                     | today's `disabled` for a service that will return |
| Replaced                                         | **301** to the replacement URL                                                                                   | renamed or merged services                        |
| Retired                                          | **410 Gone** with an explanation page ("This service has closed…") and links to alternatives; out of the sitemap | permanently closed services                       |
| Never published                                  | **404** (unchanged)                                                                                              | `draft` / `preview` content                       |

Concretely:

1. Extend the runtime status vocabulary (or the overlay derivation) so
   `disabled` no longer hides a previously public page. Suggested: `paused`
   (200 + banner) and `retired` (410); keep `disabled` as an alias of `paused`
   during migration.
2. `$.tsx` page branch: for a paused page, render normally with the existing
   maintenance/closed banner and `startHidden`; for a retired page, set
   `setResponseStatus(410)` and render a "gone" variant of `ErrorPage` with
   the explanation and links. A `/start` page whose form is unavailable either 302s to
   its parent (Option A in issue 05) or returns 200 with the banner and no
   Start button (Option B); once start pages are removed, 301 to the parent.
3. Sitemap: paused pages stay in; retired pages drop out.
4. Bare-slug redirects: resolve against all _published_ pages (paused
   included), not only visible ones.
5. Amend ADR 0063 with the table above.

## Acceptance criteria

- A page flipped to paused returns 200, shows the banner, has no Start button,
  keeps its canonical and JSON-LD, and stays in `/sitemap.xml`.
- A page flipped to retired returns 410 with an explanation page and is absent
  from the sitemap.
- `/start` for a paused service returns 302 to its parent (Option A) or 200
  with the banner (Option B); a removed `/start` 301s; neither ever 404s.
- `/get-a-primary-school-textbook-grant` redirects 301 while its page is paused.
- Tests in `apps/landing/src/routes/-preview-gating.test.ts` and
  `-publication.test.ts` cover paused and retired for page, `/start`, sitemap
  and bare slug.
- Search Console Pages report: no "Not found (404)" entries for current-shape
  URLs within two crawls of deployment.

Suggested labels: `bug`, `severity:important`, `area:frontend`, `subsystem:landing`
