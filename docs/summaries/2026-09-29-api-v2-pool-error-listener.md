# api_v2 survives Postgres dropping an idle pooled connection (#2831)

## Context

#2702's end-to-end pass found that api_v2 exited whenever Postgres terminated an idle pooled
connection. The `pg_terminate_backend` in the issue shows it, but so does every RDS restart,
failover or idle reap. `createPool()` attached no `error` listener, and an `error` event nobody
listens for is fatal in Node. A dead process is a refused connection, and landing_v2's
`stale-if-error` only covers a 5xx, so this was an outage on a routine event.

## What we did

- `b240a8b6`: wrote the e2e first. `apps/api_v2/e2e/pool.spec.ts` plus `terminateBackends` and
  `allowConnections` in `e2e/support.ts`. It failed against the unfixed build: the child exited
  on `Unhandled 'error' event … terminating connection due to administrator command`.
- `92e0bd66`: `pool.on("error", …)` in `createPool()`, plus a unit case in `src/db.test.ts`.
- `579fa190`: final-review hardening of the e2e (count only client backends, show the server
  output on failure) and one README line.
- sajclarke's review: the listener logs through one pino logger that `main.ts` shares with
  Fastify, adds the error `code`, and the README gains an "Operations" note naming the message as
  the alarm marker. The alarm itself is #2862, because no infrastructure-as-code for api_v2 lives
  in this repo. The closed-database test reopens the database in a `finally`.

## Why we did it that way

- **The listener is the whole fix, not a first step.** pg-pool's idle listener removes the dead
  client *before* it re-emits the error on the pool, and the next query dials a fresh client. A
  client that is checked out when it dies is covered by `pool.query`'s own error handler, which
  rejects into Fastify's 500 handler. api_v2 has no transactions, so no code path holds a
  client outside `pool.query`. We rejected recreating the pool (it has already discarded the
  client) and exiting so the orchestrator restarts us (exiting is the bug). v1 never crashed on
  this event only because TypeORM registers the listener internally. Neither `apps/api` nor
  `packages/database` does it in repo code, so there was nothing to match.
- **One pino logger, made in `main.ts`.** The pool exists before the Fastify app, so it cannot
  use `app.log`. `main.ts` makes the logger, hands it to `createPool`, and passes it to Fastify as
  `loggerInstance`, so drops land in the same JSON stream as the request logs. Fastify wraps the
  instance in a child that keeps its own request/response serializers, so request lines are
  unchanged. `pino` is declared in api_v2's `package.json`, because pnpm's isolated linker will
  not resolve it through Fastify. `main.ts`'s boot lines (applied, seeded, listening, the fatal
  exit) still use `console`: the review did not ask for them.
- **`code` and `error.message`, never the error.** `code` says why the connection went (`57P01` a
  restart or admin termination, `ECONNRESET` the network). On the idle path pg-pool sets
  `err.client`, so logging the whole error would dump the client object.
- **A new `pool.spec.ts`, not `boot.spec.ts`** as the issue suggested. `boot.spec.ts` deliberately
  runs with no database.
- **The spec waits for one drop log per terminated backend.** The plan said "wait for the log
  line". But `store.ts` runs queries under `Promise.all`, so the pool can hold several idle
  clients, and one line is not enough. `terminateBackends` returns how many it terminated. In the
  closed-database phase the wait happens again before the request that expects 500, so the 500
  is known to come from the refused reconnect rather than from a dead client. Counting only
  `backend_type = 'client backend'` matters because an autovacuum worker on the scratch database
  would be counted but never log a drop, and that fails as a 5 s timeout that looks like flake.
- **Survival is proven by a 200 over the socket**, not by adding exit state to the harness's
  `Server`: a dead child refuses the connection.
- **No credentials needed.** The plan said to take the e2e login from `apps/api/.env`. The user
  pointed out we were in api_v2, and api_v2's harness only needs `DB_HOST=localhost`: the default
  `postgres`/`postgres` login worked against local Postgres.

## What we almost got wrong

- The plan's closed-database step would have raced: the request could take the dead idle client
  before its error event fired. Its single-log-line wait would also have been flaky with more
  than one pooled client. Both were caught in a pre-flight scan before any code was written.
- `apps/api_v2/tsconfig.json` excludes `e2e/` and `**/*.test.ts`, and v2-rewrite PRs get no CI
  Type Check, so none of the new test code is type-checked by any gate. It was checked once by
  hand with a throwaway tsconfig. `e2e/api.spec.ts` already fails that check (TS18046
  `unknown`), from #2807.

## Open questions

- #2845: the pool still has node-postgres's defaults (no connection timeout, no keepalive). A
  database that goes *quiet*, rather than closing the socket, may hang api_v2 instead of producing
  a 5xx. That case is outside what this fix reaches.
- `feat/v2-api-init` still carries #2838 on top of a pre-squash #2807. It will not get this fix
  unless it is rebased onto `v2-rewrite`.
