# landing_v2 builds head tags, JSON-LD, breadcrumbs and analytics from the page response

## Context

Session 4 of the #2820 landing plan (#2829), the last one. Sessions 2 and 3
left `apps/landing_v2` rendering real pages from the content API with a
cache and real statuses, but with a bare `{ title }` head and no breadcrumbs.
This session adds everything the #2819 audit lists under SEO: canonical and
Open Graph tags, GovernmentService and BreadcrumbList JSON-LD, the visible
breadcrumb trail, and the Umami page-view wiring, all derived from the
`PageResponse` rather than from a registry.

## What we did

Two commits. `dc10ec81` adds `src/lib/page-head.ts` (v1's `seoTags`, with
its test), the two JSON-LD builders in `src/lib/structured-data.ts`,
`src/components/Breadcrumbs.tsx`, `src/lib/analytics.ts`,
`src/routes/-page-view-event.ts`, and wires them into the `$` route's
`head()`, the root layout, the router and the footer links. `681110cc` is
the review's follow-up: the breadcrumbs get v1's width, padding and
`print:hidden` wrapper, the page-view event gets a unit test, and a stale
comment naming `pageHead` is corrected. Fifty-seven tests in the app now.

## Why we did it that way

**Everything comes from the response; the registry is gone for good.** v1
resolved breadcrumb names with `titleForSegment` (category and subcategory
titles, then a page-title lookup by slug) and built the JSON-LD from
`ContentPage`. Here `buildBreadcrumbLd` is `Home` plus the API's trail, and
`buildGovernmentServiceLd` takes `{ title, description, url }`. The API
already resolves every name, so landing carries no taxonomy and no
`breadcrumb-hierarchy.ts`. The `/start` page has no description and an
empty category list, so every builder treats those as optional and the
page-view event falls back to `uncategorised`, as v1's did.

**The visible trail drops the current page; the JSON-LD keeps it.** The
API returns the full trail including the page itself. v1's visible
component slices the current page off, and schema.org's BreadcrumbList
expects it present, so the two consumers of the same list differ by one
element, on purpose. The root reads the `$` match with
`useMatch({ from: '/$', shouldThrow: false })`, which returns `undefined`
rather than throwing when there is no match or no loader data, so 404 and
503 renders simply show no trail. `head()` is guarded the same way.

**`pageHead` did not survive; `seoTags` did.** v1's `pageHead` wrapper
carried the title suffix and the `noindex` branch for gated pages. The
spike is public-only, so only `seoTags` was copied and the route composes
title, description and the SEO tags inline, the way v1's public branch
does. A root comment still described the old wrapper; the review caught it.

**Breadcrumbs sit outside `<main>`, in v1's wrapper.** They render between
the header and `<main>` so the skip link bypasses them. The first cut
rendered the component bare; the review pointed out that v1's
`BreadcrumbRegion` supplies the page-width container, top padding and
`print:hidden`, without which the trail misaligned and printed. The exact
class string was restored, gated on there being crumbs to show.

**Analytics is v1's, verbatim.** `router.subscribe('onResolved',
trackPageview)`, the `VITE_UMAMI_WEBSITE_ID`-gated script tag with
`data-auto-track="false"`, the footer `trackEvent` handlers Session 1 had
deferred, and `pageViewEvent` with `page.url.endsWith('/start')` in place
of v1's slug check. With the id unset locally, no script is emitted and no
request leaves the page.

**Known parity wrinkle, left alone.** TanStack `Link` treats an ancestor
path prefix as active by default, so the category crumb also receives
`aria-current="page"` beneath the current one. v1's `BreadcrumbLink` is
byte-identical and has the same behaviour; changing it here would be a
design-system decision, not a spike one.

## Open questions

- The category crumb links to `/family-birth-relationships`, which the API
  does not serve yet, so it 404s. That is a producer gap: category pages
  are outside the spike's four seeded pages.
- The `aria-current` doubling above is worth an `activeOptions={{ exact:
  true }}` in v1 and v2 together, if the design system agrees.
- The spec file for the page-view event uses `.spec.ts` where the app's
  other tests use `.test.ts`; Vitest's default include picks up both.
