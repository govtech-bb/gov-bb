# simple_mock_api and the landing-v2 contract (#2820, sessions #2821–#2825)

## Context

The landing v2 spike (#2820) needs a content API that `apps/landing_v2` can
render from. The audit on #2819 fixed the shape; the plan turned it into five
sessions. This session ran all five in one worktree, one commit per session,
against a new shared branch `v2-alt-rewrite` (cut from `v2-rewrite` at
290ab029) so that this PR and the parallel `landing_v2` PR merge into the
same place. CI does not run on that base, so the local build and test gate is
the only gate.

## What we did

- `packages/landing-v2-contract`: `Frontmatter`, `PageResponse` and
  `CONTENT_ELEMENTS` — the one allowlist the API sanitizer and the landing
  component map both derive from.
- `apps/simple_mock_api`: Express 5 + `node:sqlite`, ESM/NodeNext, run with
  tsx, built with tsc as the type gate. Commits, in order: scaffold; compile
  module with v1 parity goldens; seed as publish; `GET /pages?url=`; then two
  test-only commits from review.
- The v1 markdown pipeline and its per-request rules are copied verbatim from
  `apps/landing` (prettier restyling and `.js` suffixes aside), with
  `rehype-sanitize` inserted straight after `rehype-raw`.
- Four golden fixtures, generated once from v1's own processor by
  `scripts/write-v1-goldens.ts`, pin parity on the four seed pages.

## Why we did it that way

- **Sanitizer before `rehype-slug` and autolink, not after.** The default
  schema clobber-prefixes `id`s and drops `className`, so running it later
  would have rewritten heading anchors. Placed after `rehype-raw` it sees the
  final HTML and leaves the pipeline's own additions alone. `tel:` is added to
  the `href` protocols and as a protocol for `contact[tel]` because the
  default list omits it and 96 v1 pages link phone numbers.
- **Goldens from v1 rather than a cross-app import in the spec.** A spec
  importing `apps/landing` would resolve another app's `node_modules` inside
  this app's test graph. The generator is the only file that touches
  `apps/landing`; it lives outside `src/`, is excluded from the build, and is
  never imported.
- **Build `paths` point at emitted declarations, not source.** The plan (and
  the CLAUDE.md recipe) assumed `references` plus `paths`→`src/index.ts`. For
  a plain-`tsc` consumer that fails with TS6305: tsc expects a referenced
  project's output under `dist/packages/<name>/src` (the base tsconfig's
  repo-root `rootDir`) while `@nx/js:tsc` writes `dist/src`. The recipe only
  works when both sides are built by the nx executor, which rewrites paths
  itself. We chose `paths`→`packages/<name>/dist/src/*.d.ts` (guaranteed by
  `dependsOn: ^build`) with `tsconfig.dev.json` overriding back to source for
  tsx — the split `apps/form_builder_api` already documents — over `tsc -b`,
  which would have built every referenced library a second time into a
  different layout. `baseUrl: "."` is set in the app because the inherited
  repo-root `baseUrl` makes child `paths` resolve from the wrong directory.
- **`implicitDependencies: ["!landing"]`.** nx inferred a `landing` dependency
  from the golden script's relative import, so `^build` tried to run
  landing's network-bound build. One line removes the spurious edge.
- **`@types/hast` in `devDependencies`, against the plan.** sherif's
  `types-in-dependencies` rule fails a private package with `@types/*` in
  `dependencies`; the pre-flight ruling to follow the plan was overturned by
  running the linter. pnpm's isolated linker still installs it into the
  package's own `node_modules`, so consumers resolve `hast` from the emitted
  declarations.
- **Lockfile deltas kept small.** A plain `pnpm install` after adding the
  compile dependencies bumped `@types/hast` under remark/rehype snapshots
  shared with landing and broke `landing:typecheck` on `ariaHidden: true`; the
  Task 3 lockfile was hand-limited to the new importer block. Adding `zod`
  later produced a `supertest`→`supports-color` peer-suffix ripple in
  `apps/api` and `apps/form_builder_api` that could not be hand-narrowed
  without a dangling snapshot, so that pnpm-computed result was accepted.
  Both pass a frozen install; the `landing_v2` PR will conflict on the
  lockfile regardless.
- **One definition of `parentSlug`, router by closure.** The plan listed
  `parentSlug` as a copy in both the seed and the route; it is exported once
  from `seed/pages.ts`. The scaffold's `app.locals.db` was dropped in favour
  of `createPagesRouter(db)` mounted before the terminal error handler.
- **The 301 keeps `Location: /<url>`** (v1's shape, per the plan) even though
  it is a site path on the API origin: a default `fetch` follows it into an
  Express HTML 404. Consumers must use `redirect: 'manual'` and read the
  header or the `{ redirect }` body; the `landing_v2` plan already does.

## What we almost got wrong

- The first rollback test never reached the transaction — both bad fixtures
  fail frontmatter validation before `BEGIN`, so deleting the whole
  `ROLLBACK` wrapper left the suite green. A duplicate-URL fixture pair now
  fails on the second INSERT, and the report records that the test fails with
  `ROLLBACK` commented out. The pairing first suggested (`dup/` plus
  `nested/dup/`) does not collide under the real `leafFromSlug`, which only
  strips a literal `<category>/` prefix; nesting under the category name does.
- Two route rules ("a `form_id` with no `forms` row is not public" and "a
  non-public `/start` hides the online method while the index stays public")
  survived their removal until the whole-branch review asked for cases that
  mutate only the row each rule reads.
- The plan expected declarations at `dist/packages/<name>/src`; that was
  stale form-types output in the main checkout, not what the executor emits.

## Open questions

- Deferred by the final review as fix-later: redundant `withoutPosition` in
  the compile spec; `VISIBILITY_OVERRIDES` typed as `string` and recipe
  `formId`/`meta.visibility` unvalidated (a missing `formId` would insert a
  NULL key silently); per-request `db.prepare` in `startSubPageLevel` and
  `pageTitle`; the seed walker skipping any directory named `forms` at any
  depth; `src/seed.ts` beside `src/seed/index.ts`; the contract package's
  `main`/`types` pointing at files that never exist (form-types convention);
  `tableScopes` and the error handler's 500 path have no direct test.
- The built `dist/` does not run under plain Node (workspace `exports` point
  at `.ts`); the plan chose tsx-run/tsc-build for a local-only spike, so this
  is by design and must not be papered over with a `start` script.
- `highlight` is not in `CONTENT_ELEMENTS`; a page using it would render an
  empty `highlights` container. Add `highlight: ['title']` when such a page is
  migrated (open question 3 on the plan).
