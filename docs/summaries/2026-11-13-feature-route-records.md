# Landing's feature-route pages get records in api_v2's estate snapshot (#3256)

## Context

#3256 asked for every page landing builds from code to get an api_v2 record, so it stays in category listings, search and the sitemap once those read api_v2 alone. That means the `-meta.ts` feature routes and the self-rendered StormReady checklist (`.tsx`). Going in, category listings in api_v2 mode already left them out on sandbox. #3604 also named this issue as something setting `API_V2_URL` on api v1 (alpha-infra#801) waits for.

## What we did

- Re-scoped the issue. The pharmacy finder and the calculators have `index.md` pages, so the import already had them. Only three `-meta.ts` routes and the checklist were missing. The issue body and its two comments (the editor-note decision, and the steps) are the spec.
- `apps/api_v2/scripts/build-seed-data.ts` reads every `-meta.ts` under `apps/landing/src/routes` and writes a page from its `META`, with a fixed note as the body. `estate.json` gains the three pages, and `seed.test.ts` checks them.

## Why we did it that way

- **A listing record, not a page.** Landing serves all three from real routes, which take precedence over the `$` catch-all, so it never renders the row's body. The row exists for category listings, search, the sitemap and `GET /catalog`.
- **The body is a plain-paragraph note for editors.** In editor_v2 these rows look like any other page. But editing the body does nothing, and editing the title or description changes only the listing. Changing visibility only hides the page from listings, because Find an emergency shelter gates on its own `-meta.ts` and the other two don't gate at all. The user chose a note over two alternatives:
  - an empty body, which warns editors of nothing;
  - a page type, which needs schema and editor work.
- **Plain paragraph, not an HTML comment.** api_v2's search text includes the body. Landing indexes it but never displays it, so the note's words can match a one-word query like "code". An HTML comment would avoid that, since the search chunker drops it. But editor_v2 can't show raw HTML visually and would open these pages in source mode with a warning, so the user chose the paragraph.
- **`content_slug` is `META.url`.** That is the slug landing's registry gives a feature page, and the `service_status` key `loadFeatureRouteServices` emits. So the import's visibility overlay still applies to these pages.
- **`require()`, not `import()`.** tsx runs this script as CommonJS (it uses `__dirname`), and top-level `await import()` fails to transform. Restructuring the script around an async main was a bigger diff than one lint-disabled `require`. The `-meta.ts` files have only type-only imports, so requiring them runs nothing.
- **A local `FeatureMeta` type, not landing's.** Landing's type file pulls in zod and landing's frontmatter module, which `tsconfig.check.json` would then typecheck under api_v2's options. The script already copies from landing rather than importing from it (`NESTED_WITHOUT_URL`).
- **`loadFeatureRouteServices` is not reused.** Its mapper keeps only url, title, category and visibility, for the services index. The snapshot also needs description and keywords, and widening the mapper would change api v1's services index for no gain there.
- **The StormReady checklist is left out.** `routes/$.tsx` does `v2Page ?? findPage(splat)`, so an api_v2 row at the checklist's url would take precedence over the self-rendered `.tsx` and render the note. It waits on #3239.

## Open questions

- Sandbox already had its one-time import, so this snapshot doesn't reach it. #3256 step 2 creates the three pages there by hand in editor_v2. #3709 (drift between `estate.json` and deployed databases) may cover them instead, once this merges.
- What the StormReady checklist becomes (#3239, unassigned).
- A page type that shows code-rendered rows as read-only in editor_v2, if editors trip over the note.
