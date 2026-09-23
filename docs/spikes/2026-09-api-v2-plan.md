# Implementing `apps/api_v2` against the block editor spike

A plan for #2700, written after the block editor spike (#2788/#2789) shipped
`packages/block-kit`, `packages/spike-db`, `apps/editor_v2` and
`apps/landing_v2`. Read [the spike findings](2026-09-block-editor-findings.md)
first — several decisions below only make sense against what that spike
learned.

The spike deliberately built its storage layer behind one interface,
`DocumentStore`, with a comment saying no consumer should know "whether it is
talking to PGlite in the browser or, later, to `ApiStore` issuing the same SQL
server-side". This plan cashes that cheque.

## The decision that has to be made first

**#2700 and the block editor spike do not agree on what a page is.**

The EPIC's ERD gives `content_pages.body_markdown text`. The spike gives
`content_pages.body jsonb`, holding `{version, blocks, refs}` — a closed
palette of nine block types, validated by nine rules, with `refs` resolving
links and data-collection queries by key.

This is not a formatting preference. The findings record the specific ways
markdown fails as a storage format for government content:

- **Markdown smuggles presentation.** The Crop Over page needed a coloured
  callout and got a hand-written `<div class="bg-blue-10">` inside the
  markdown body. Nothing validates it, nothing restyles it when the design
  system changes, and nothing stops the next author inventing a different
  div.
- **Markdown cannot express a data reference.** The bank holiday calendar is
  computed from rules; the pharmacy finder is 163 records with facets. Neither
  is text. Under `body_markdown` they become either hardcoded HTML or a
  bespoke shortcode syntax that is a block model with worse ergonomics.
- **Markdown cannot be validated against the estate.** Rule 8 — a start link
  pointing at a page that does not exist is rejected — is only possible
  because the link is a `ref` with a known shape, not a string in prose.

The recommendation is that **`api_v2` adopts the spike's schema**
(`packages/spike-db/src/migrations.ts`, migration `001_init`), and #2699's SQL
is updated to match rather than the other way round. That schema already runs
unmodified on PGlite (Postgres 17 in WASM) and on Postgres 15+, which is how
the spike's tests run it.

If the EPIC owner prefers `body_markdown`, that is a legitimate call — but it
invalidates `block-kit`, `editor_v2` and the nine rules, so it should be made
explicitly and before any of the work below starts.

The rest of this plan assumes the block document wins.

## What already exists, and what `api_v2` must not re-invent

| Already built | Where | What `api_v2` does with it |
| --- | --- | --- |
| Document format and nine block types | `packages/block-kit/src/types.ts` | Imports it. The wire format is this type. |
| Nine validation rules | `packages/block-kit/src/validate.ts` | **Runs it server-side on every write.** |
| Safe-href handling | `packages/block-kit/src/href.ts` | Runs it on ingest as well as on render. |
| Schema SQL | `packages/spike-db/src/migrations.ts` | Becomes the Drizzle schema, column for column. |
| The query surface | `packages/spike-db/src/store.ts` | Becomes the endpoint surface, method for method. |
| Renderer | `packages/block-kit/src/render/` | Unchanged — `landing_v2` keeps using it. |

`block-kit` is already a browser-safe package with no Node imports, so the API
can depend on it. Per CLAUDE.md, that means `block-kit` needs an `@nx/js:tsc`
build target and `apps/api_v2/tsconfig.json` must list it in `references`, or
the build fails with TS6059/TS6307.

## Endpoint surface

Derived directly from `DocumentStore`, and no larger. #2700's note — "resist
building CRUD for tables nothing reads yet" — is the right instinct; this list
is what `editor_v2` and `landing_v2` actually call today.

**Reads (public)**

```
GET  /pages                      → DocumentSummary[]   (published only by default)
GET  /pages/:id                  → PageDocument | 404
GET  /pages/by-url?url=/a/b      → PageDocument | 404   (landing_v2's routing key)
GET  /collections                → CollectionDefinition[]
GET  /collections/:key/records   → Array<Record<string, unknown>>
```

**Writes (authenticated, per #2701)**

```
PUT    /pages/:id                → PageDocument | 409 | 422
DELETE /pages/:id                → 204
PUT    /collections/:key/records/:recordKey   → 204
DELETE /collections/:key/records/:recordKey   → 204
```

Three details that are not negotiable, because the spike's UI already depends
on them:

1. **`If-Unmodified-Since` semantics on `PUT /pages/:id`.** The store takes
   `ifUpdatedAt` and the `update … where updated_at = $2` returning zero rows
   is what raises `ConflictError`. The editor renders a conflict notice from
   it and three e2e tests assert it. Carry it as a header or a body field, but
   carry it — an API that last-write-wins silently discards an editor's work.
2. **422 carries the validation errors, not a message.** `ValidationFailedError`
   holds `ValidationError[]`, each naming the block it came from, and the
   editor's error summary links each one to its block. Flattening these to a
   string breaks that.
3. **Validation runs on the server.** It currently runs in the browser, which
   means it is advisory — anyone can POST whatever they like. `validateDocument`
   needs the same context server-side (`{collections, pageUrls}`), read fresh
   inside the same transaction as the write.

## The three things that get harder over HTTP

These are the real work. Everything above is mechanical.

### 1. Live updates have no HTTP equivalent

`packages/spike-db/src/react.tsx` uses PGlite's `useLiveQuery`. When an author
saves in one tab, the site in another tab updates with no reload — `e2e/live-update.spec.ts`
asserts exactly that, with a comment saying "No `site.reload()` anywhere in
this test."

Over an API that becomes one of:

- **Server-Sent Events** on a `/events` endpoint fed by the `change_events`
  table, which the spike already writes on every save. This preserves the
  behaviour and the tests.
- **Polling** `updated_at`. Simpler, and honest for a spike, but the tests
  become "updates within N seconds" rather than "updates".
- **Drop it.** Defensible if `landing_v2` moves to build-time fetching as
  #2702 describes — a statically built site has no live updates by
  definition.

**This choice should be made before the client work starts**, because it
decides whether `useDocumentByUrl` keeps its current signature.

Recommendation: SSE off `change_events`. The table, the append-only trigger and
the per-entity `version_no` already exist and are otherwise unexercised.

### 2. The finder filters 163 records in the browser

`useRenderData` loads a whole collection and the finder facets, searches and
paginates client-side. That is fine for 163 pharmacies and wrong for a
collection of any size.

For the spike, keep it: `GET /collections/:key/records` returns everything and
nothing changes. But the endpoint should take the filter parameters from day
one even if it ignores them, so moving the work server-side later is not a
breaking change to the client.

### 3. `landing_v2` reads live; #2702 says it should read at build time

The spike's site reads the database on every render because that is what made
the live-update demo possible. #2702 wants build-time fetching. These are
different apps wearing the same name.

The cheapest reconciliation: `landing_v2` keeps a single data-access module
(it already does — `useDocumentByUrl`, `useRenderData`) and that module gets a
build-time implementation alongside the live one. The renderer and every
component below it are already pure functions of `{doc, data}`, so neither
knows which it got.

## Work breakdown

Each step names how it is verified, per CLAUDE.md's goal-driven execution.

1. **Settle the schema question above.** → verify: #2699's SQL and the EPIC's
   ERD either match `001_init` or an ADR records why not.
2. **Scaffold `apps/api_v2`** — Fastify, nx project with an `@nx/js:tsc` build
   target, `references` to `block-kit`. → verify: `nx run api_v2:build`
   compiles clean.
3. **Port `001_init` to Drizzle**, idempotently. → verify: running migrations
   twice against a fresh local Postgres succeeds both times (the ministry_key
   42701 lesson), and the resulting tables match `001_init` column for column.
4. **Fail loudly with no database.** → verify: a test that boots with a bad
   `DB_HOST` asserts a non-zero exit and a clear message, not a server serving
   empty results.
5. **Read endpoints.** → verify: one test per endpoint for the happy path and
   the 404, per #2700's acceptance criteria.
6. **Write endpoints with server-side validation and `ifUpdatedAt`.** →
   verify: a test that a stale `ifUpdatedAt` returns 409 and leaves the stored
   row untouched; a test that an invalid document returns 422 with per-block
   errors; a test that a `javascript:` href in a `ref` is refused on ingest.
7. **`ApiStore implements DocumentStore`** in a new package, or in `spike-db`
   beside `PgliteStore`. → verify: the existing `store.test.ts` suite runs
   against both implementations.
8. **Point `editor_v2` and `landing_v2` at it** behind an env flag, keeping
   PGlite as the offline path. → verify: the 99-test Playwright suite passes
   against `ApiStore` with only the live-update tests changed, and those only
   if polling was chosen over SSE.
9. **Auth on writes** — #2701.

Steps 2–6 are independent of the client work and can land first.

## Out of scope

- Migrating the remaining ~82 markdown pages. The spike moved seven.
- Categories as database tables. The spike reads `CATEGORY_TAXONOMY` from
  `@govtech-bb/content/categories` and derives breadcrumbs and page addresses
  from it. Until something needs to edit a category, a table is a second copy
  of a fact that already has one home.
- Any change to `apps/api`, `apps/landing` or the forms platform.
- Collection *definition* editing. The spike edits records but not the schema
  of a collection — a gap the findings already record.

## The one thing this plan cannot tell you

Whether a closed nine-block palette is enough. The findings are explicit that
it is not, quite: page chrome the system does not already know — the "About
this list" heading, the source citation — has no honest home in the current
palette, and a real migration will find more. Budget for adding block types
during the migration rather than assuming the nine are final.
