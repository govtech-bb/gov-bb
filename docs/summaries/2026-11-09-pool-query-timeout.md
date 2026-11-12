# api_v2 answers 500 instead of hanging when Postgres goes quiet (#2845)

## Context

During an RDS failover or a network partition, Postgres can stop answering without closing the socket. #3128 had already capped how long api_v2 waits for a connection (`connectionTimeoutMillis: 2000`). It had not capped a query sent on a socket that has gone quiet: that query waited until the OS gave up on TCP, which takes minutes. landing's 750 ms abort already protects citizens. This work stops api_v2's own requests, and the pooled clients they hold, from hanging.

## What we did

- `createPool()` takes an optional `queryTimeoutMs`, which becomes node-postgres's client-side `query_timeout` and Postgres's `statement_timeout`. Every pool also gets TCP keepalive.
- `main.ts` gives each request query 5 s and each boot migration 10 min. The three jobs pass no limit.
- `connect()` replaces the handle's `transaction`. It takes its own client, runs drizzle's transaction on it, and destroys the client (`release(true)`) on any error other than `TransactionRollbackError`.
- e2e: `startQuietProxy()` in `e2e/support.ts` and `e2e/quiet-database.spec.ts`. The proxy pauses both sockets without dropping bytes to freeze the connection, and `freezeOn(marker)` freezes it partway through a transaction.

## Why we did it that way

- **`query_timeout` for the quiet socket, and `statement_timeout` as well.** Postgres enforces `statement_timeout` itself, so it does nothing once the server stops answering; only the client's `query_timeout` ends that wait. The plan left `statement_timeout` out on that basis. In review on #3615, a maintainer showed that the client limit alone causes a second problem. When a request times out, the pool destroys its client and opens a new one, but a backend waiting on a lock doesn't notice that its client has gone (`client_connection_check_interval` defaults to 0). With the content lock held, three waves of ten timed-out transactions left 10, 20 and then 30 backends waiting, while the pool reported none. Repeated retries could then use up Postgres's connections and take down unrelated reads. So the request pool sets both limits to the same 5 s. `client_connection_check_interval` would also do it, but only by polling the socket, while `statement_timeout` is plain and enforced everywhere.
- **Migrations raise both limits.** pg reads `config.query_timeout || pool's`, so a per-query 0 falls back to the pool's 5 s and the client override is a large value. `@types/pg` 8.20's `QueryConfig` doesn't list `query_timeout`, hence the local `TimedQuery` type. On the server, `migrationExec` puts `set local statement_timeout` at the start of the script. Each migration is one multi-statement simple query, which runs as one implicit transaction, so `set local` holds for that script only and the pooled connection is back to 5 s afterwards. Since Postgres 13 the limit applies to each statement in the script separately, so the advisory-lock wait gets 10 min too. A unit test checks both halves of the override, and checks that the connection is back to the request limit.
- **One pool with a per-query override, not a second pool for boot work.** The override is one call, while a second pool would add a second lifecycle to `main.ts`.
- **Keepalive alone isn't the fix.** node exposes only the idle delay; the probe interval and count come from the OS. Keepalive eventually finds dead idle sockets, but it doesn't make a request fail fast.
- **Why the transaction wrapper exists.** Adding the time limit exposed two faults in drizzle 0.45's `NodePgSession.transaction` (`session.js:180-194`), and an e2e test failing first proved each one:
  1. `begin` runs before the `try/finally`. A `begin` that timed out never released its client, and pg-pool counts an unreleased client forever (`_clients` shrinks only in `_remove`). Ten failed writes during a blip exhausted the pool until restart.
  2. The `finally` releases without an error. A query that timed out stays the client's active query, its `rollback` times out behind it, and the client goes back to the pool still inside the server-side transaction. The next borrower's `commit` then committed the abandoned write: the test found write A's page stored even though A had answered 500.
- **Why not the other fixes.** drizzle 0.45.4, the latest stable, has the same code. A pg `Client` subclass or an `on("connect")` hook would have to intercept the overloaded `query()` and still couldn't release a client drizzle had dropped. Destroying the socket from our own code emits `'error'` on a checked-out client with no listener, which crashes the process. `release(true)` is pg-pool's documented way to destroy a client: it ends the client without emitting an error, and Postgres rolls back whatever that connection held.
- **The `TransactionRollbackError` exemption.** That error reaches the wrapper only after drizzle's own `rollback` succeeded, so the connection is clean and validation or conflict refusals keep it. Any other failed transaction reconnects, which costs a little.
- **The user chose to fix the transaction faults in this PR** rather than file a follow-up, because the time limit is what turns them on, and the second one loses data integrity.

## What we almost got wrong

- The plan said a client timed out inside a transaction "goes back to the pool… so this doesn't block the goal". That was true of the HTTP status but missed both faults above. Only probing `pg_stat_activity` after the first passing e2e run showed the leaked `idle in transaction` backend.
- We left out `statement_timeout` because a quiet server can't enforce it. That was the right reason for the quiet case but the wrong conclusion. Without it, a query the client has given up on keeps running on the server, so failed requests could use up Postgres's connections. A maintainer reproduced this in review, and we confirmed it locally on Postgres 16.15.
- The plan's editor-write test would have used a normal session cookie. Its per-request session lookup hits the frozen database first, so the write never reaches the transaction. The spec runs with `AUTH_BYPASS=true` instead.

## Open questions

- A freeze partway through a transaction answers 500 after about 10 s, not 5 s, because drizzle awaits a `rollback` that times out too. That is acceptable under the editor's 15 s, but it is double the request limit.
- The limits are constants. Make them env-configurable only when an environment needs different values.
