# @govtech-bb/spike-db

The spike's database: the DDL, a migration runner, the seed loader, and the
`DocumentStore` every query goes through.

## The schema is the point

`migrations/001_init.sql` is a trimmed subset of the Sprint 1 schema — same
table names, same column types, same constraints — so findings transfer. It
runs unmodified in PGlite and in a stock Postgres 17.

That file is the source of truth. `src/migrations.ts` mirrors it for the
browser, which cannot read it off disk; `migrations.test.ts` fails if the
two drift. Regenerate with:

```bash
pnpm --filter @govtech-bb/spike-db generate
```

## Why PGlite

Zero infrastructure — no container, no connection string, no deploy target —
while still being real Postgres: the constraints, the triggers and the JSONB
operators all behave as they will in production.

`localStorage` was the earlier plan and was rejected for one specific
reason: its API is synchronous, which pulls code toward reads in render
paths and `useState` initialisers. Swapping in `fetch` later would then mean
restructuring every call site. PGlite is async by construction, so that
class of mistake is not available.

## SQL lives behind `DocumentStore`

No React component issues a query. `PgliteStore` implements the interface
now; an `ApiStore` implements it later, issuing the same SQL server-side.
The point of the interface is that no consumer knows which it has.

`save()` validates against all nine rules, then runs a conditional update on
the `updated_at` that was loaded. Zero rows affected means someone else
changed the row: it throws `ConflictError` and nothing is overwritten.

**One seam.** Live queries are not on the interface — "tell me when this
changes" has no shape that both PGlite and an HTTP driver implement. They
live in `src/react.tsx`, which is the only other place SQL appears.

## Verifying the schema is portable

```bash
pnpm --filter @govtech-bb/spike-db verify:restore
```

Dumps the seeded database with `pg_dump`, starts a stock `postgres:17-alpine`,
restores with `ON_ERROR_STOP=1`, and asserts every constraint still
_enforces_ — the append-only trigger, the body CHECK, the collection foreign
key — rather than merely existing. Needs Docker.

## Tests

```bash
pnpm exec nx run spike-db:test
```

These carry four of the five findings questions. See
[the findings](../../docs/spikes/2026-09-block-editor-findings.md).
