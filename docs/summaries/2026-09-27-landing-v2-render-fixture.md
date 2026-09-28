# landing_v2 renders a PageResponse through v1's component map, from a captured API response

## Context

Session 2 of the #2820 landing plan (#2827), the first session on top of the
merged producer side (#2832: `packages/landing-v2-contract` and
`apps/simple_mock_api`). Going in, `apps/landing_v2` was the Session 1 shell
with no routes. The goal was the renderer only: a `$` route whose loader gets
a `PageResponse` from a server function that returns a committed fixture, and
v1's markdown component map with the mutating passes removed. The real fetch
and cache are Session 3. Sessions 2 to 4 ship as one PR against
`v2-alt-rewrite`, stacked on the Session 1 PR (#2830).

## What we did

One commit, `72c73507`. `src/routes/$.tsx`, `src/lib/content-api.ts` (the
stub), `src/lib/format-date.ts`, the `components/markdown/*` and
`components/content/*` copies, two fixtures under `src/fixtures/`, and
`MarkdownContent.test.tsx` rewritten. Three dependencies added to
`apps/landing_v2` (`@types/hast`, `hast-util-to-jsx-runtime`, `date-fns`),
`resolveJsonModule` and the contract `paths` entry in `tsconfig.json`, and the
Session 1 `@ts-expect-error` in `Header.tsx` deleted now that a route exists.

## Why we did it that way

**The fixtures are captured API responses, not a v1 script's output.** The
plan said to run v1's `processMarkdown` plus `bakeStartLinkFormId` in a
throwaway script and commit the result. By the time this session ran, the
review of #2832 had already saved real `GET /pages?url=` bodies for the birth
certificate index and `/start` pages. Those are the bytes landing will
actually receive (sanitised by the API, positions stripped, start links
resolved server-side), so they are the better fixture and cost nothing to
produce. Both were committed: the index page's start link keeps its `href`
to `/start` (href wins), and only the `/start` page carries the bare
`data-form-id` anchor that yields a `/forms/<id>` button. The plan's verify
line that expected a `/forms/` URL on the index page was wrong for that
reason.

**The seeded pages have no tables, so the tests build hast by hand.** v1's
renderer test fed markdown through `processMarkdown`. v2 has no parser, and
the two fixtures contain only prose tags. The rewritten test therefore uses
the fixtures for what they can prove (heading anchors keep `aria-hidden`
and `tabindex`, lists stay bare, both start-link shapes) and small literal
`Root` objects for tables, phone cells, `tel:` links, `notice`,
`show-hide` and `link-button`. The alternative, a markdown-derived fixture,
would have reintroduced the parser the spike exists to remove.

**Contract resolution is `paths` only.** The plan proposed `references` plus
`paths`. The #2832 review proved that with this app's standalone `noEmit`
tsconfig, `references` makes `tsc` demand a `dist/packages/...` declaration
nx never emits (TS6305), while `paths` to `src/index.ts` alone type-checks
and lets Vite and Vitest bundle the source. It is also how the scaffold
already resolves `@govtech-bb/analytics`.

**`@types/hast` is pinned to 3.0.4 in the lockfile by hand.** pnpm resolves
a fresh `^3.0.4` to 3.0.5, but the `hast-util-to-jsx-runtime` snapshot the
renderer uses is typed against 3.0.4, and two copies make the API's `Root`
unassignable to the renderer's `Nodes`. The producer PR hit the same wall
and settled on 3.0.4 workspace-wide. A frozen install after editing the
lockfile does not relink; the importer's `node_modules` had to be removed
first. That recipe is now in the brief for any later dependency change.

**The completeness guard is two `satisfies`, not one.** The plan asked for
`satisfies Record<ContractElement, ...>` so a contract element without a
renderer fails to compile. Applying that and `Partial<Components>` to one
object literal broke contextual typing for the un-annotated destructured
renderer params (nine TS7031 errors). Splitting the map into
`contractComponents` (typed as `Partial<Components>`) and checking it
against `Record<keyof typeof CONTENT_ELEMENTS, unknown>` at the spread site
keeps both guarantees. Removing a key was tested to fail with TS1360.
`highlight` stays as an extra key for v1 parity; the API never emits it.

**`.validator`, not the plan's `.inputValidator`.** The installed Start
marks `inputValidator` deprecated and v1's own server functions use
`.validator`. The brief asked the implementer to resolve the builder chain
against the installed types, and it did.

**The loader returns the `PageResponse` itself.** Sessions 3 and 4 read
`loaderData.breadcrumbs` and `loaderData.frontmatter` directly, so the
loader is not allowed to wrap the page. This is pinned in all three briefs.

## Open questions

- Hydration was not checked in a browser: neither the implementer nor the
  reviewer had a Chrome binary. SSR output is verified by curl. A browser
  pass is planned for the end of the PR if the Playwright tools work.
- `MdComponents.tsx` carries the completeness comment above the first
  `satisfies` while the guard lives at the spread site; the final review
  will decide whether to move it.
