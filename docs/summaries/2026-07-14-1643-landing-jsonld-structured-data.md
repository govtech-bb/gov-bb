# 2026-07-14 — #1643: JSON-LD structured data for apps/landing

## Context

Issue #1643: add schema.org JSON-LD to the landing site — the biggest remaining
SEO upside after the #1641 baseline (OG/Twitter, canonical, sitemap), which
deliberately left structured data out. Plan:
`docs/plans/landing-jsonld-structured-data.md`. Branch off `main`.

## What we did

- New `src/lib/structured-data.ts` with four pure builders returning plain LD
  objects: `buildOrganizationLd`, `buildWebSiteLd`,
  `buildGovernmentServiceLd(page)`, `buildBreadcrumbLd(page)`. Unit tests in
  `structured-data.test.ts` (6 cases).
- `routes/__root.tsx`: `Organization` + `WebSite` added to the `head()`
  `scripts` array (always emitted; the existing Umami script is now appended
  after them instead of being the sole entry).
- `routes/$.tsx`: `GovernmentService` + `BreadcrumbList` added to the
  service-page branch of `head()`, gated on the existing `isPublic` flag.

## Why we did it that way

- **Followed the #1641 conventions rather than inventing.** Pure builders in
  `lib/` (like `seoTags`/`buildSitemapXml`) and the same `isPublic` gate that
  already suppresses canonical/OG on gated pages — so noindex pages get no
  JSON-LD, matching the issue's requirement without new machinery.
- **Injection via TanStack `head()` `scripts` with inline `children`.** The
  issue pointed at the Umami `scripts` entry, but Umami only exercises `src`.
  Checked the router types (`RouterManagedScriptTag` has `children?: string`;
  the head `scripts` slot is typed `unknown`), which confirmed an inline
  `{ type: 'application/ld+json', children: JSON.stringify(...) }` entry is
  supported — no separate injection mechanism needed.
- **Organization gets a stable `@id`; WebSite/GovernmentService reference it.**
  Avoids repeating the Organization object and tells Google they're the same
  entity.
- **Breadcrumb title logic is replicated, not imported.** The visible
  `<Breadcrumbs>` component is client-side (`useLocation`) and can't run inside
  `head()`. Rather than refactor it (out of scope), the builder re-uses the same
  registry lookups (`getCategoryTitle`/`getSubcategoryTitle`/`getPageTitle`) — a
  ~4-line parallel, commented as such. The current page's last crumb uses
  `frontmatter.title` directly rather than a slug lookup.

## Decisions / deferrals

- **`sameAs` omitted.** Optional in the issue; we have no confirmed official
  Government of Barbados profile URLs. Left out rather than guessed — a cheap
  follow-up if URLs surface.
- **Manual validation is a pre-merge step.** Google Rich Results Test and the
  schema.org validator need the rendered output, which the offline build can't
  produce (landing's prebuild fetches a live API); run against the PR preview.

## Verify

`landing:test` 217 passed (6 new); `tsc --noEmit` clean for the changed files
(the sole error, `vite.config.ts` `NitroPluginConfig`, is pre-existing and
untouched). Full landing `build` runs in CI.

## Open questions

- Official `sameAs` profile URLs, if any, to enrich the Organization.
