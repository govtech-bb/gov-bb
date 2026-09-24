# Regression guards: head tests, content metadata lint, Lighthouse on previews

## Problem

The route that produces the head for most pages (`$.tsx`) has no test of its
`head()`; nothing in CI checks that a content page has a description or a
sane title length; no performance or SEO score is measured on previews. The
findings in issues 05, 08 and 09 will drift back without guards.

## Where

- `apps/landing/src/routes/$.tsx`, `lib/page-head.test.ts`,
  `lib/sitemap.test.ts`, `lib/structured-data.test.ts`,
  `routes/-preview-gating.test.ts`, pharmacy `-publication.test.ts`
- `scripts/validate-content-names.ts` (runs in the CI "Validate Content" job,
  `.github/workflows/ci.yml`)
- `.github/workflows/pr-preview.yml` (landing preview is build-only; the axe
  scan covers forms only)

## Fix

1. `apps/landing/src/routes/-content-head.test.ts`: real registry, call
   `Route.options.head({ loaderData })` for page / category / subcategory /
   `/start`; assert suffix, description, single canonical, JSON-LD types.
2. `scripts/seo-frontmatter-guards.ts` + spec (pattern of
   `polyclinic-contact-guards.*`), called from `validate-content-names.ts`:
   missing description, description > 160, title > 60, on public pages. Use
   `@govtech-bb/content` `loadContent()` (already folds `start.md` into its
   parent). Start with presence + upper bounds; a hard 70–160 band fails ~30
   pages today (issue 09 first). The form-builder CMS writes pages through the
   GitHub API, so the gate applies to CMS-authored pages too — intended, but
   coordinate.
3. Sitemap and structured-data tests extended per issues 08 and 11.
4. Optional: Lighthouse CI on the landing PR preview for `/`, a topic page and
   a service page, asserting performance ≥ 80 mobile and SEO = 100, using the
   Playwright Chromium already in the toolchain.

## Acceptance criteria

- `pnpm exec nx run landing:test` fails if a `$.tsx` branch drops the suffix,
  description or canonical.
- `pnpm validate-content-names` fails on a public page without a description.
- (Optional) preview workflow posts Lighthouse scores.

Suggested labels: `enhancement`, `severity:minor`, `subsystem:landing`, `subsystem:ci`, `area:frontend`
