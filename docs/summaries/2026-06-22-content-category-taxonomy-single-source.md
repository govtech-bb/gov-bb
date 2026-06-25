# Share the landing category taxonomy — Implementation Session

**Date:** 2026-06-22
**Branch:** `worktree-lib-05-share-category-taxonomy`
**Issue:** #1393 (LIB-05)
**Plan:** `docs/plans/1393-share-content-category-taxonomy.md`
**ADR:** `docs/decisions/0056-content-category-taxonomy-single-sourced-and-cms-writes-canonical.md`

## Context

`apps/form_builder` hard-coded a `LANDING_CATEGORIES` list (slug+title, plus the
`youth-and-community` subtree) that had to stay byte-compatible with landing's
`CATEGORIES`. It had already drifted — landing carried three categories the copy
lacked (`social-empowerment`, `ministry-of-youth`, `housing`). The CMS also
*writes* new categories into landing's `categories.ts` via the GitHub API, so a
stale copy silently mis-categorises new content pages.

## What we did

- **New canonical module `packages/content/src/categories.ts`** exporting
  `CATEGORY_TAXONOMY` (slug + title + description + subcategory tree),
  `CATEGORY_BY_SLUG`, `getSubcategory`, and the `Category`/`SubCategory` types —
  a verbatim copy of landing's old `CATEGORIES` data. Exposed as the
  `./categories` subpath in `package.json` and re-exported from the barrel.
- **Landing's `categories.ts` became a thin re-export** of the canonical module
  under its established local names, so all consumers (`routes/index.tsx`,
  `routes/$.tsx`, `lib/search.ts`, `content/registry.ts`, and its tests) keep
  importing from `./categories` unchanged.
- **form_builder's `-lib.ts`** dropped the hand-synced array (and its now-dead
  `LandingCategory` interface) and aliases `CATEGORY_TAXONOMY` as
  `LANDING_CATEGORIES`. `insertCategoryEntry` was retargeted to the canonical
  file's format.
- **form_builder's `-server.ts`** `CATEGORIES_TS` now points at
  `packages/content/src/categories.ts` — the CMS write target and the source of
  truth are one file.
- **Wiring:** `workspace:*` dep in both apps; `@govtech-bb/content` +
  `@govtech-bb/content/categories` paths in `tsconfig.base.json`; a local
  `@govtech-bb/content/categories` path in `apps/landing/tsconfig.json`.

## Why we did it that way

**Descriptions are canonical, not landing-local.** The plan's chosen approach
kept descriptions in landing, layered over a slug/title-only shared list. We
deviated (confirmed with the user): putting descriptions on the canonical entry
makes the package a real single source of truth and lets the CMS write a
category *and* its description in one edit. The local-layer alternative would
force the CMS into a second, fragile write against a landing-side description
map — more code to remove the very duplication we were eliminating. See the ADR.

**A dedicated `./categories` subpath, not the barrel, for the apps.** The
content barrel re-exports `load.ts`, which imports `node:fs`. landing and
form_builder are browser bundles, and form_builder's `-lib.ts` is explicitly
"pure (no IO)". Importing the barrel would drag `node:fs` into client bundles,
so both apps import the pure `@govtech-bb/content/categories` subpath. The
barrel still re-exports the taxonomy (for `apps/chat`, a node consumer) without
collision.

**The CMS writer is now coupled to the canonical file's formatting.** The
canonical file uses the content package's house style — double quotes,
semicolons — so `insertCategoryEntry`'s duplicate guard (`slug: "…"`), append
anchor (`];\n\nexport const CATEGORY_BY_SLUG`), and `tsString` (double-quote
escaping) were all updated to match, and the `-lib.spec.ts` fixture was rewritten
to the canonical shape to guard against future format drift.

**No `project.json` build target for `packages/content`.** Its only consumers
are bundler apps (chat/landing/form_builder), not strict `@nx/js:tsc`
libraries, so the monorepo's buildable-and-referenced rule doesn't apply
(`apps/chat` already consumed the package under this pattern).

**Landing needed its own tsconfig path.** As with the shared-analytics work,
landing doesn't extend `tsconfig.base.json` and resolves workspace-source
packages via its own `paths` + `vite-tsconfig-paths` — so a local
`@govtech-bb/content/categories` entry was required in addition to the base one.

## Verification

- `nx run-many -t test -p form-builder-app landing chat` → form-builder-app 638
  pass (incl. a new test asserting the three formerly-missing categories are now
  recognised), landing pass, chat pass.
- `nx run-many -t build --exclude=landing,cms` → 15 projects built.
- `tsc -b` → rc 0.
- `landing typecheck` → only the **pre-existing** `vite.config.ts` /
  `NitroPluginConfig` error; the shared import resolves cleanly.
- A `code-reviewer` subagent confirmed the `insertCategoryEntry` anchor matches
  the canonical file byte-for-byte, the landing re-export preserves every
  consumed symbol, and the taxonomy is a faithful copy.

## Notes

- Kept `LANDING_CATEGORIES`/landing's `CATEGORIES` typed `Array<Category>`
  (matching landing's original exported type) rather than tightening to
  `ReadonlyArray`; no consumer mutates it and the CMS write is string surgery,
  not runtime mutation.
- ADR numbered `0056`; the consolidation epic's parallel merges have produced
  duplicate `0054`s before, so the number may need bumping at merge time per the
  known collision pattern.
