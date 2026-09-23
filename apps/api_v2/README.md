# api_v2

The content API for the block editor spike (#2700). Fastify, Drizzle, a fresh
Postgres of its own — it reads and writes no table any other service uses.

## Running it

```bash
createdb gov_bb_v2
DB_NAME=gov_bb_v2 pnpm --filter @govtech-bb/api-v2 dev
```

It migrates and seeds on boot, both idempotently, and refuses to start if the
database is unreachable rather than serving an empty estate. Connection comes
from the same `DB_*` variables every other service here reads; `SEED=false`
skips the seed.

## Pointing the apps at it

```bash
VITE_API_URL=http://localhost:3020 pnpm --filter @govtech-bb/editor-v2 dev
```

Unset, `editor_v2` and `landing_v2` keep the browser-local PGlite the spike
was built on. Set, both read and write this API. The seam is
`packages/spike-db/src/bindings.tsx`; no component knows which backend
answered it.

## Endpoints

|                                 |                                              |
| ------------------------------- | -------------------------------------------- | ------------- |
| `GET /pages`                    | summaries; `?drafts=true` includes drafts    |
| `GET /pages/by-url?url=…`       | the site's routing key                       |
| `GET /pages/:id`                | the editor's key                             |
| `GET /collections`              | collection definitions                       |
| `GET /collections/:key/records` | records; `?keys=true` for editing            |
| `GET /events`                   | SSE change feed, off `change_events`         |
| `PUT /pages/:id`                | save; `if-updated-at` header, 409 / 422      |
| `POST /pages`                   | create                                       |
| `DELETE /pages/:id`             | delete                                       |
| `PUT                            | DELETE /collections/:key/records/:recordKey` | record writes |

Writes are unauthenticated — that is #2701, and nothing here should be
reachable from anywhere but a laptop until it lands.

## Tests

`pnpm exec nx run api-v2:test` — no database needed. They run against PGlite
in-process, so the migration, the constraints, the enums and the append-only
trigger are all genuinely exercised. What that does _not_ prove is behaviour
against a real Postgres over TLS: see the timestamp-precision note in
`docs/spikes/2026-09-api-v2-plan.md` for a bug that only a real server showed.
