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
database is unreachable rather than serving an empty estate. Connection comes
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

## Endpoints

Reads are public. Writes are unauthenticated until #2701 lands, and nothing
here should be reachable from anywhere but a laptop until it does.

| Method   | Path                                   | What it is                                 |
| -------- | -------------------------------------- | ------------------------------------------ |
| `GET`    | `/pages`                               | summaries; `?drafts=true` includes drafts  |
| `GET`    | `/pages/by-url?url=…`                  | the site's routing key                     |
| `GET`    | `/pages/:id`                           | the editor's key                           |
| `GET`    | `/collections`                         | collection definitions                     |
| `GET`    | `/collections/:key/records`            | records; `?keys=true` for editing          |
| `GET`    | `/version`                             | a change token clients poll                |
| `GET`    | `/openapi.json`                        | the spec, generated from the route schemas |
| `POST`   | `/pages`                               | create                                     |
| `PUT`    | `/pages/:id`                           | save; `if-updated-at` header, 409 / 422    |
| `DELETE` | `/pages/:id`                           | delete                                     |
| `PUT`    | `/collections/:key/records/:recordKey` | write a record                             |
| `DELETE` | `/collections/:key/records/:recordKey` | delete a record                            |

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

`content_pages.body` is a **block document** — `{version, blocks, refs}`,
validated by `@govtech-bb/block-kit` — not a markdown string. The EPIC's ERD
(#2698) says `body_markdown`; [ADR 0074](../../docs/decisions/0074-content-pages-store-a-block-document-not-markdown.md) sets out why the block
document won: markdown cannot express a data reference, cannot be validated
against the estate, and smuggles presentation in as hand-written HTML.

`block-kit`'s rules run **here**, inside the same request as the write, on
context read fresh from the database. In the browser spike they ran only in
the browser, which made them advisory.

The DDL lives in `src/migrations/001_init.ts` as a string rather than a `.sql`
file, because this app compiles to CommonJS and its tests run as ESM: the two
spell "the directory this file is in" differently and only one exists at a
time. `src/schema.test.ts` compares the result against the Drizzle definition
by reading `information_schema`, so the two cannot drift.

## Tests

```bash
pnpm exec nx run api_v2:test   # no database needed
```

They run against PGlite in-process — Postgres 17 compiled to WASM — so the
migration, the constraints, the enums and the append-only trigger are all
genuinely exercised.

```bash
DB_HOST=localhost pnpm exec nx run api_v2:e2e
```

The end-to-end suite builds the app, boots `node dist/src/main.js` as its own
process against a scratch database it creates and drops, and drives it over a
socket. It proves the things PGlite cannot: that the DDL runs on a real
server, that `timestamptz(3)` survives the node-postgres driver, and that an
unreachable database is a non-zero exit rather than a server answering with
empty arrays. Without `DB_HOST` the database-backed half skips itself rather
than failing.

What neither suite proves is behaviour against RDS over TLS. That is a
deploy-time acceptance criterion on #2700 and needs #2707.
