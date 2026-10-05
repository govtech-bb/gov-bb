# api_v2

The content API for the content-as-data spike (#2700). Fastify, Drizzle, a
fresh Postgres of its own — it reads and writes no table any other service
uses, and it shares no code with `apps/api`, which continues to run untouched.

## Running it

```bash
createdb gov_bb_v2
DB_NAME=gov_bb_v2 pnpm --filter @govtech-bb/api-v2 dev
```

It migrates and seeds on boot, both idempotently, and refuses to start if the
database is unreachable rather than serving an empty estate. The seed is the
live estate — the 116 markdown pages under `apps/landing/src/content`, the
categories and a row per form recipe — snapshotted into
`src/seed-data/estate.json` by `pnpm --filter @govtech-bb/api-v2 seed-data`. Connection comes
from the same `DB_*` variables every other service here reads — the Drizzle
spelling of `packages/database/src/data-source-env.ts`, not a bespoke config.
`SEED=false` skips the seed.

| Variable                                           | Default                                |
| -------------------------------------------------- | -------------------------------------- |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` | local Postgres                         |
| `DB_NAME`                                          | `gov_bb_v2`                            |
| `DB_SSL_CA`                                        | Node's trust store, in production only |
| `PORT`                                             | `3020`                                 |
| `CORS_ORIGINS`                                     | the dev servers                        |

## Operations

Request logs and the pool's own logs are JSON lines on stdout, through one pino
logger. `idle database connection dropped` (level `warn`) means Postgres closed
a connection the pool was holding: a restart, a failover, an idle reap. The
process keeps serving and reconnects on the next query. `code` says why it
went: `57P01` for an admin termination or restart, `ECONNRESET` for the
network. One is routine; a steady run is a database in trouble, and otherwise
shows only as scattered 500s. The message is the marker the on-call alarm
matches (#2862), so do not reword it.

## Endpoints

Reads are public. Writes are unauthenticated until #2701 lands, and nothing
here should be reachable from anywhere but a laptop until it does.

| Method   | Path            | What it is                                 |
| -------- | --------------- | ------------------------------------------ |
| `GET`    | `/pages?url=…`  | the site's read: a public page, see below  |
| `GET`    | `/pages/:id`    | the editor's read, any visibility          |
| `GET`    | `/version`      | a change token clients poll                |
| `GET`    | `/openapi.json` | the spec, generated from the route schemas |
| `POST`   | `/pages`        | create                                     |
| `PUT`    | `/pages/:id`    | save; `if-updated-at` header, 409 / 422    |
| `DELETE` | `/pages/:id`    | delete                                     |

`GET /pages?url=` answers `{url, frontmatter, hast, breadcrumbs}`:

| Status | When                                                                                   |
| ------ | -------------------------------------------------------------------------------------- |
| 400    | `url` missing or empty                                                                 |
| 301    | a bare `/<slug>` with no page of its own, naming exactly one public page               |
| 404    | no page at `url`, or it or a page above it is not `public`                             |
| 404    | a `/start` page whose form is not `public`                                             |
| 200    | the page; its Start link is removed when its `/start` sub-page or form is not `public` |

`forms.visibility` is read on every request, and a form with no row counts as
hidden. `frontmatter` is the stored frontmatter with the title and description
(columns of their own) put back; `breadcrumbs` is the full trail, current page
included and Home not.

Because writes are open, the CORS origin allow-list is load-bearing rather
than hygiene: it is what stops any page a developer has open from preflighting
a `DELETE` at their instance. `CORS_ORIGINS` is a comma-separated list,
defaulting to the dev servers' origins.

## The OpenAPI spec

`openapi.json` is committed, and it is generated — never hand-edited. Every
route carries a Fastify schema, which is the same object that validates its
requests and serialises its responses, so a response that stops matching its
documented shape stops being served in that shape.

```bash
pnpm --filter @govtech-bb/api-v2 openapi   # regenerate after a route change
```

`src/openapi.test.ts` fails when the committed document and the generated one
disagree, and again when the app serves a route the document does not carry.

## What a page is

`content_pages.body_markdown` is the source, and `hast` is the sanitised tree
compiled from it **here**, inside the same request as the write
(`src/markdown.ts`), so a read never parses markdown and nothing the sanitiser
refused is ever stored. The block document of
[ADR 0074](../../docs/decisions/0074-content-pages-store-a-block-document-not-markdown.md)
returns later, as a change of its own.

A page files under at most one `categories` row and names at most one
`forms` row, both by foreign key, so an unknown category or form id is a 422
rather than a page that silently never shows its Start button. `visibility`
(`public | preview | draft`) replaces `is_draft`; `published_at` is stamped
the first time a page goes public.

Migration `002_markdown_pages` moves a database from `001_init` onto this
schema. The block documents a laptop may still hold cannot become markdown,
so it deletes them first and the seed refills the estate on the next boot.

The DDL lives in `src/migrations/` as strings rather than a `.sql`
file, because this app compiles to CommonJS and its tests run as ESM: the two
spell "the directory this file is in" differently and only one exists at a
time. `src/schema.test.ts` compares the result against the Drizzle definition
by reading `information_schema`, so the two cannot drift.

## Tests

```bash
pnpm exec nx run api_v2:test   # no database needed
```

They run against PGlite in-process — Postgres 17 compiled to WASM — so the
migrations, the constraints, the enums and the append-only trigger are all
genuinely exercised, and one test seeds the whole estate.

```bash
DB_HOST=localhost pnpm exec nx run api_v2:e2e
```

The end-to-end suite builds the app, boots `node dist/src/main.js` as its own
process against a scratch database it creates and drops, and drives it over a
socket. It proves the things PGlite cannot: that the DDL runs on a real
server, that `timestamptz(3)` survives the node-postgres driver, and that an
unreachable database is a non-zero exit rather than a server answering with
empty arrays, and that a connection Postgres drops after boot is logged and
survived (500 while the database is gone, 200 once it is back). Without
`DB_HOST` the database-backed half skips itself rather than failing.

What neither suite proves is behaviour against RDS over TLS. That is a
deploy-time acceptance criterion on #2700 and needs #2707.
