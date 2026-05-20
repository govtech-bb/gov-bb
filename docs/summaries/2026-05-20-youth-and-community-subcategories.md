# Youth and Community sub-categories — Session Summary

**Date:** 2026-05-20
**Branch:** feat/youth-and-community-subcategories
**PR:** (to be opened against `dev`)

## What was built

The `youth-and-community` category in `apps/landing` now resolves to a sub-category index page listing 5 sub-categories (Youth development and leadership, Skills/trades/vocational training, Entrepreneurship and business, Arts and culture, Children/families/community). Each sub-category resolves to its own index page listing the leaf services that belong to it. 20 new leaf content pages were authored by fetching alpha.gov.bb's corresponding pages and converting them to markdown. All URLs are 3 segments (`/<category>/<subcategory>/<leaf>`) so they match alpha.gov.bb exactly.

To make this work the content registry grew: an optional `subcategories` array on `Category`, an optional `subcategory` field on page frontmatter validated against the parent category at module load, and a registry that constructs 3-segment URLs from category + subcategory + leaf-slug. The catch-all route grew to handle three URL shapes (1/2/3 segments). Breadcrumbs gained a sub-category resolver.

## Why it looks the way it does

**Sub-categories as typed data, not markdown index files.** Two candidate models surfaced during planning. The chosen one (data on `Category`) trades one new TS field plus one frontmatter field for a single source of truth on taxonomy shape, type-checked sub-category copy, and registry-time validation of the page → sub-category relationship. The rejected one (an `<subcat>/index.md` per sub-category) would have been symmetric with how multi-step pages work (`apply-for-conductor-licence/index.md` + `.../start.md`) but conflates page-level structure with taxonomy structure. The decision is recorded in `docs/decisions/0002-subcategories-are-category-data-not-markdown-indexes.md` because the same question will come up again when another category needs sub-categories.

**Generic, not special-cased.** It would have been cheaper to handle `youth-and-community` as a one-off in the route loader. The user explicitly chose the generic extension because the same shape will be useful for any future category that wants sub-categories — once special-casing starts, it tends to grow.

**3-segment URL parity with alpha.** Alpha.gov.bb already exposes `/youth-and-community/<subcat>/<leaf>` URLs. The local app could have flattened to 2 segments and treated sub-categories as a UI grouping only, but that breaks URL portability — anyone linking from alpha or comparing the two surfaces would see drift. The user confirmed parity is the priority. The cost is that the catch-all route now disambiguates 1 / 2 / 3-segment requests: 1 segment is a category (which may render a sub-category index if the category declares one), 2 segments tries a page first then falls back to a sub-category index, 3 segments is always a leaf page. The route's loader is the only place this is encoded.

**File-system nesting under `content/<category>/<subcategory>/` is permitted but optional.** Existing convention puts every page at the top level of `content/` (e.g. `apply-for-a-passport.md`), with multi-step pages in a single-named folder. For the 20 new pages, top-level placement would have meant 20 short, alphabetically-noisy filenames (`byac.md`, `cip.md`, `yes.md`) sitting alongside the existing descriptive names. Nesting them under `youth-and-community/<subcat>/` keeps the file tree organised. To avoid the registry building URLs like `youth-and-community/youth-and-community/youth-development-leadership/byac`, the URL construction strips a leading `<category>/` or `<category>/<subcategory>/` prefix from the slug before joining. The rule lives in `registry.ts` (`leafFromSlug`).

**Dropped `source_url` from the imported frontmatter.** The plan called for setting `source_url` to the alpha page as provenance. On closer inspection that field drives the `MigrationBanner` component, which renders "This page was originally published on gov.bb" — a message that's correct for the legacy gov.bb migration but wrong for content sourced from alpha.gov.bb. Setting it would have shown a misleading banner on every new page. Provenance is now captured in git history and the PR description instead. A future need to surface "imported from alpha" on the page would call for a separate frontmatter field and a separate banner component, not overloading the migration one.

**"Apply now" links rewritten to absolute alpha URLs.** Alpha hosts each leaf page's application form at `/.../<slug>/form`. The local app doesn't carry those form sub-pages — building them is out of scope for this PR. Leaving the markdown's "Apply now" as a relative link would 404 locally. The conversion prompt rewrote each one to the absolute `https://alpha.gov.bb/.../form` URL so the button takes the user to alpha and actually does something. If form sub-pages are migrated locally later, those links become candidates for re-pointing.

**Existing overlapping pages left in place.** Five existing local pages cover the same ground as some of the new alpha-imported pages — most notably `apply-to-the-barbados-youthadvance-corps.md` (vs new `byac.md`) and `register-for-community-sports-training-programme/` (vs new `ydp.md`). The user chose to leave them. Both versions ship in this PR. The overlapping pages are listed in the PR description so a follow-up consolidation PR knows where to look.

**`service_type: information` everywhere.** Every alpha leaf page in this batch sets `service_type: information`. None of them have a digital action that lives on the landing site itself — the "Apply now" link points off-platform. If a future page is migrated *with* its form, change that page to `service_type: digital`.

## Decisions worth flagging

- **Maximum taxonomy depth is 3 segments.** The catch-all route's branching assumes category → optional sub-category → leaf. Adding a fourth level (sub-sub-category) requires re-opening the routing model rather than nudging it. The decision record makes this explicit.
- **No data-driven cross-categorisation of sub-categories yet.** A page belongs to one sub-category (`subcategory: <slug>`). The registry already allows multiple categories per page (`categories: [...]`); sub-categories are deliberately single-valued. If a service legitimately fits two sub-categories (e.g. YDP is both "youth development" and "skills/trades"), the current escape is to leave the duplicate listing on alpha.gov.bb and only list it once here.

## Key files

| File | Change |
|------|--------|
| `apps/landing/src/content/categories.ts` | Added `SubCategory` interface, optional `subcategories` field on `Category`, populated `youth-and-community` with its 5 sub-categories, `getSubcategory` lookup helper |
| `apps/landing/src/lib/frontmatter.ts` | Added optional `subcategory` field to schema and resolved type |
| `apps/landing/src/content/registry.ts` | Sub-category validation at load, 3-segment URL construction, `leafFromSlug` strip of redundant directory prefix, `getSubcategoryTitle` export |
| `apps/landing/src/routes/$.tsx` | Loader handles 1/2/3-segment URLs; new `SubcategoryIndexView` and `SubcategoryView` components |
| `apps/landing/src/components/Breadcrumbs.tsx` | Resolve sub-category segments via parent category context |
| `apps/landing/src/content/youth-and-community/**/*.md` | 20 new leaf pages, content converted from alpha.gov.bb |
| `docs/decisions/0002-subcategories-are-category-data-not-markdown-indexes.md` | New ADR |
| `docs/plans/youth-and-community-subcategories.md` | Plan written in the same session |

## Verification

- `npx nx build landing` clean before and after content was added (registry runs frontmatter validation at module load — invalid frontmatter would have failed the build).
- `npx nx lint landing` clean.
- Dev server smoke test (`npm run dev:landing`): `/youth-and-community` renders 5 sub-category cards; `/youth-and-community/skills-trades-vocational-training` renders the 5 leaf services sorted alphabetically; `/youth-and-community/youth-development-leadership/byac` renders the imported page with correct breadcrumb chain; unknown sub-category and unknown leaf slug both 404; existing 2-segment URL `/work-employment/register-for-community-sports-training-programme` still resolves (no regression).

## Open follow-ups

- Consolidate the 5 overlapping local pages with their alpha-imported counterparts in a separate PR.
- Decide whether to migrate alpha's `/<...>/form` sub-pages to landing or keep linking out. Today every "Apply now" goes off-platform.
- Add unit tests for the registry's URL construction and sub-category validation — the existing landing test suite doesn't cover the registry, but this is the first change that materially altered URL construction logic.
