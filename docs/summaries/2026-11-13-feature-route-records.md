# Landing's feature-route pages get records in api_v2's estate snapshot (#3256)

## Context

#3256 asked for every page landing builds from code to get an api_v2 record, so it stays in category listings, search and the sitemap once those read api_v2 alone. That means the `-meta.ts` feature routes and the self-rendered StormReady checklist (`.tsx`). Going in, category listings in api_v2 mode already left them out on sandbox. #3604 also named this issue as something setting `API_V2_URL` on api v1 (alpha-infra#801) waits for.

## What we did

- Re-scoped the issue. The pharmacy finder and the calculators have `index.md` pages, so the import already had them. Only three `-meta.ts` routes and the checklist were missing. The issue body and its two comments (the body decision, and the steps) are the spec.
- `apps/api_v2/scripts/build-seed-data.ts` reads every `-meta.ts` under `apps/landing/src/routes` and writes a page from its `META`, with an empty body. `estate.json` gains the three pages, and `seed.test.ts` checks them, visibility included.

## Why we did it that way

- **A listing record, not a page.** Landing serves all three from real routes, which take precedence over the `$` catch-all, so it never renders the row's body. The row exists for category listings, search, the sitemap and `GET /catalog`.
- **An empty body, because chat reads bodies.** The public chat assistant's api_v2 ingest (`apps/chat/src/ingest/api-v2-source.ts`) chunks the `body_markdown` of every `/catalog` page. Any text there becomes a source chat cites to the public. With an empty body, chat gets only the title-and-description chunk, which is right for a page whose content lives in code. The cost is that editor_v2 shows these rows as ordinary empty pages: editing the body or title changes nothing on the page, and making one Draft only hides it from listings, because the routes gate on their `-meta.ts` or not at all. A page type that labels these rows would fix that, and would need its own issue.
- **`content_slug` is `META.url`.** That is the slug landing's registry gives a feature page, and the `service_status` key `loadFeatureRouteServices` emits. So the import's visibility overlay still applies to these pages.
- **`require()`, not `import()`.** tsx runs this script as CommonJS (it uses `__dirname`), and top-level `await import()` fails to transform. Restructuring the script around an async main was a bigger diff than one lint-disabled `require`. The `-meta.ts` files have only type-only imports, so requiring them runs nothing.
- **A local `FeatureMeta` type, not landing's.** Landing's type file pulls in zod and landing's frontmatter module, which `tsconfig.check.json` would then typecheck under api_v2's options. The script already copies from landing rather than importing from it (`NESTED_WITHOUT_URL`).
- **`loadFeatureRouteServices` is not reused.** Its mapper keeps only url, title, category and visibility, for the services index. The snapshot also needs description and keywords, and widening the mapper would change api v1's services index for no gain there.
- **The StormReady checklist is left out.** `routes/$.tsx` does `v2Page ?? findPage(splat)`, so an api_v2 row at the checklist's url would take precedence over the self-rendered `.tsx`. It waits on #3239.

## What we almost got wrong

- **The body first carried a note for editors** ("This page is built in landing code. Only the title, description, category and keywords here are used…"). We agreed it on the issue after checking only landing. Review on #3716 found that chat ingests it, which would have shown the note to the public and made its own claim untrue. We also weighed an HTML comment, to keep the note out of search. That worry was wrong too: landing's search admits a result on title, keywords and description only (`IDENTITY_FIELDS`), so the body never decides a match.
- **We ran only api_v2's tests before the first push.** CI's `landing:test` then failed: landing's render parity test (`apps/landing/src/lib/api-v2-render-parity.test.tsx`, #3135) reads `estate.json` and requires each seeded page to render the same HTML as its static twin, and the note made the three differ. An exemption list fixed it for a while. The empty body made the pages match their twins, so the exemption was dropped and the test now checks their HTML too. A change to `estate.json` needs `landing:test` and `editor_v2:test` as well as api_v2's, and chat's ingest should be checked too.

## Open questions

- Sandbox already had its one-time import, so this snapshot doesn't reach it. #3256 step 2 creates the three pages there by hand in editor_v2, unless #3709 (drift between `estate.json` and deployed databases) covers them once this merges. Either way, two Landing v2 smoke tests need these pages exempted first. `content-source.live.pw.ts` expects `x-content-source: api_v2` on every `/catalog` page, but only `routes/$.tsx` sets it. `visibility.live.pw.ts` expects a Preview catalog page to 404, but these routes don't read api_v2's visibility.
- What the StormReady checklist becomes (#3239, unassigned).
- A page type that shows code-rendered rows as read-only or labelled in editor_v2.
