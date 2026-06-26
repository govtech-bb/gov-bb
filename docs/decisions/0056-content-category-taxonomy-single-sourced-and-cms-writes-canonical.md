# 0056 — The content category taxonomy is single-sourced, and the CMS writes the canonical file

## Context

The landing site's content category taxonomy (top-level slugs + titles, their
descriptions, and the `youth-and-community` subcategory tree) lived in
`apps/landing/src/content/categories.ts` as `CATEGORIES`. `apps/form_builder`
needs the same slugs/titles to offer categories when authoring a content page,
and its CMS **writes a newly-created category back into landing's file** via the
GitHub API (`insertCategoryEntry`, string surgery anchored on the
`CATEGORY_BY_SLUG` line).

form_builder kept its own hand-synced `LANDING_CATEGORIES` copy — slug+title
only, no descriptions — with a comment acknowledging the manual mirror. It had
already drifted: landing had three categories (`social-empowerment`,
`ministry-of-youth`, `housing`) the copy lacked. A stale copy lets an author
pick a category landing no longer recognises, silently mis-categorising the
page (LIB-05, #1393).

The duplication and the write path are coupled: removing the duplicate copy is
pointless if the CMS keeps appending to a file that is no longer the source of
truth — they would just drift again from the other direction.

## Decision

The category taxonomy is **single-sourced in `@govtech-bb/content`**
(`packages/content/src/categories.ts`, exposed as the `./categories` subpath and
re-exported from the barrel). It is pure data — no IO — so it is safe to import
into browser bundles.

1. **Descriptions are canonical, not app-local.** `CATEGORY_TAXONOMY` carries
   slug, title, optional description, and the subcategory tree. Descriptions are
   editorial copy, but keeping them on the canonical entry makes the package a
   true single source of truth and lets the CMS write a category and its
   description in **one** edit. (The alternative — descriptions layered locally
   in landing — was rejected because it forces the CMS to do a second, fragile
   write into a landing-side description map.)
2. **Apps derive; they never re-declare.** `apps/landing/src/content/categories.ts`
   is a thin re-export (`CATEGORY_TAXONOMY as CATEGORIES`, plus `CATEGORY_BY_SLUG`,
   `getSubcategory`, and the `Category`/`SubCategory` types) so existing
   consumers import from `./categories` unchanged. form_builder imports
   `CATEGORY_TAXONOMY`. Neither holds its own slug/title list.
3. **The CMS write target is the canonical file.** `insertCategoryEntry` and the
   `CATEGORIES_TS` path in `-server.ts` point at
   `packages/content/src/categories.ts`; the append anchor and emitted entry
   format match that file (double-quoted entries, the `];` array close before
   `export const CATEGORY_BY_SLUG`). The write target and the source of truth
   are the same file.

## Consequences

- Adding or renaming a category is a one-file edit; a category created through
  the form_builder CMS appears in both apps from a single PR — they cannot
  drift.
- No `project.json` build target is required for `packages/content`: its
  consumers (`apps/chat`, `apps/landing`, `apps/form_builder`) are all
  bundler apps, not strict `@nx/js:tsc` libraries (per the monorepo build
  gotcha in `CLAUDE.md`). If a strict-tsc library ever consumes it, the
  buildable-and-referenced rule kicks in.
- Resolution is wired the established two ways: `tsconfig.base.json` paths for
  apps that extend the base (form_builder), and a local path entry in
  `apps/landing/tsconfig.json` because landing does not extend the base and
  resolves workspace-source packages via its own paths + `vite-tsconfig-paths`.
- A future change that needs landing-only presentation fields on a category
  (something form_builder must not see) would layer them in landing on top of
  the canonical entry — it must not fork the slug/title/description list.
- The CMS's string-surgery writer is now coupled to the canonical file's
  formatting: changing the quote style or the `CATEGORY_BY_SLUG` anchor in
  `packages/content/src/categories.ts` requires updating `insertCategoryEntry`
  in lockstep (the `-lib.spec.ts` fixture guards this).
