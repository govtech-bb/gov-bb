# Remove dead landing UI: StageBanner branches + TableOfContents pipeline

**Issue:** [#1414](https://github.com/govtech-bb/gov-bb/issues/1414) [DEAD-06]
**Branch:** `dead-06-landing-stagebanner-toc` → `sandbox`

## What changed

Two pieces of dead UI removed from `apps/landing`:

1. **`StageBanner` trimmed to `alpha`.** It declared a `Stage = 'alpha' | 'beta'
   | 'migrated'` union with per-stage COPY/DEFAULT_URL tables and
   `isMigrated`/`external`/`originalSource` branching, but its sole call site
   (`Header.tsx`) only ever passes `stage="alpha"`, and the "migrated" case is
   served by the separate `MigrationBanner`. `Props` is now `{ stage: 'alpha';
   url?: string }` — `stage` is kept so the call site and `variant={stage}` are
   unchanged.

2. **`TableOfContents` + its heading-collection pipeline deleted.** The
   component's import and render in `MarkdownContent` were both already commented
   out — it shipped to nobody. Behind it sat a whole pipeline existing only to
   feed it: the `collectHeadings` rehype plugin, the `headings` field on
   `ContentPage`/`MarkdownModule`, its emission in `vite-plugin-markdown.ts`, its
   return from `processMarkdown`, and the prop threaded through `$.tsx`. All
   removed end-to-end, plus the tests that covered the dead paths.

## Why these decisions

- **Delete, not restore, the ToC.** Confirmed with Isaiah on 2026-06-23. The
  component was disabled deliberately and nothing depended on it; reviving it
  would mean re-deciding its layout and design, which wasn't the ask.

- **Kept `rehypeSlug` + `rehypeAutolinkHeadings`.** These generate the heading
  `id`s and the appended `#` anchor links — they are independent of
  `collectHeadings` and separately tested, so they stay. Only the
  heading-*collection* (the data array that fed the ToC nav) was removed.

- **Left the `lg:grid-cols-3` / `col-span-2` layout untouched** in
  `MarkdownContent`. With the ToC gone the third column renders empty — but the
  ToC was *already* commented out, so this exactly matches current production
  rendering. Reclaiming the full width is a deliberate visual change out of scope
  for a dead-code removal; flagged to Isaiah as a possible follow-up.

## Verification

`landing:test` (142 pass), `tsc -b` clean, `nx run-many -t build
--exclude=landing` (16 projects). Straggler sweep for
`TableOfContents`/`collectHeadings`/`MarkdownHeading` returned zero. landing's
full build can't run offline (prebuild hits a live forms API), so tests +
type-check are the local gate; CI builds it.
