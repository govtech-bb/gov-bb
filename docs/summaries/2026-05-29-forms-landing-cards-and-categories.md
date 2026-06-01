# Forms landing: card list + category grouping

**Branch:** `feat/forms-landing-cards`
**Issue:** none (ad-hoc request; no matching open issue found)

## What this was

The forms app landing (`apps/forms/src/routes/index.tsx`) was a plain bulleted
`<ul>` of text links. Three changes, in order:

1. **Card list.** Each form link became a full-width card with minimal padding
   (`px-4 py-3`), a subtle border, hover tint, keyboard focus ring, and a `›`
   chevron. Semantic `<ul>`/`<li>` structure kept (accessibility + existing
   tests). Styled with Tailwind utilities + govbb brand tokens, matching
   `site-header.tsx`.
2. **Heading.** Promoted to an `<h1>` and given the styles-package type scale
   (`govbb-text-h1`); the heading text settled on "Forms". This let the
   `jest-axe` `heading-order` rule be re-enabled for the route (it had been
   disabled only because the page previously led with an `<h3>`).
3. **Category grouping.** Cards are grouped under category headings (`<h2>`,
   `govbb-text-h2`), sorted alphabetically with the fallback bucket last.

## Why the approach looks the way it does

- **Category source is `contactDetails.title`.** The form list endpoint
  (`/form-definitions`) previously returned only `{ formId, title, version }`.
  We surface `serviceContractSchema.contactDetails.title` (the owning
  ministry/department) as a new optional `category` on each summary. This was a
  deliberate choice over adding a dedicated taxonomy field — the contact block
  already names the owning body.

- **The category data is currently empty everywhere.** None of the 57 recipe
  files populate `contactDetails`, so every form lands in the fallback bucket
  today. The plumbing was built anyway so grouping works the moment recipes get
  `contactDetails` filled in. This was surfaced to the user before building;
  they chose to proceed with a fallback bucket labelled **"Unknown Category"**.

- **API omits `category`; the client owns the fallback label.** The backend
  adds `category` to a summary *only* when `contactDetails.title` exists
  (spread-conditional, so the key is absent otherwise). The "Unknown Category"
  label is a presentation concern and lives in the landing component
  (`UNKNOWN_CATEGORY`), not in the API. A bonus: existing backend `findAll`
  tests (whose mock data has no `contactDetails`) kept passing unchanged because
  no `category` key is added.

- **Both recipe sources had to learn `category`.** The list is assembled from
  two places — `RecipeFileLoaderService.findAll` (files) and
  `FormDefinitionsService.findAllFromDb` (DB) — so both gained the same
  conditional `category` mapping, and the `findAll` / controller return types
  were widened. The `both`-source dedup path needed no change; it spreads the
  per-source objects through.

- **Grouping is a pure exported helper.** `groupFormsByCategory` is exported
  from the route module so it's unit-tested directly (empty, multi-category,
  blank/missing → fallback, sort order) in addition to the rendered-output
  assertions.

## Verification

- `pnpm exec nx run-many -t build --exclude=landing` — green (13 projects).
  `landing` excluded only because its prebuild fetches a live API (offline
  caveat in CLAUDE.md); CI builds it.
- `forms` unit suite — **654 passed, 1 skipped, 28 suites**.
- `api` unit suite — **616 passed, 64 suites**.
- Not done here: visual QA in a running app (needs the backend to serve forms)
  and a live demonstration of a non-empty category (no recipe has
  `contactDetails` yet).
