# api_v2 gets a `/health` route for the load balancer (#3128)

## Context

The api_v2 ALB target group checked `/docs/openapi.json`, which returns `app.swagger()` and never
touches Postgres. A task that had lost its database stayed in rotation answering 500 on every
content read. Startup already refuses to run without a database (`connect()` + `main.ts` exit 1),
so the gap was only what happens after boot.

## What we did

- `385dcd906`: `ping(db, timeoutMs = 2000)` in `src/db.ts`; `AppOptions.ready` and a hidden
  `GET /health` (200 `{status:"ok"}` / 503 `{error:"database_unavailable"}`) in `src/app.ts`;
  composed as `ready: () => ping(db)` in `main.ts` and defaulted in `createTestApp`.
- Tests first: two `app.inject` cases, a `ping` timeout unit case, and `/health` 503-then-200
  assertions inside the existing closed-database e2e in `e2e/pool.spec.ts`.
- The sandbox deploy smoke step now hits `/health` first; README row added.
- Review (sajclarke) reversed the single DB-backed check: `/health` now answers 200
  `{status:"ok"}` without touching the database, and the DB check moved to a hidden
  `/health/db` (200 / 503 `database_unavailable`) that the ALB must not use. `createPool` now
  sets `connectionTimeoutMillis: 2000` (#2845).

## Why we did it that way

- **The ALB checks the process only; the DB check is a separate path (reversed in review).**
  The first version had one DB-backed `/health` for the ALB, arguing that ECS churning
  replacements during an outage was churn, not a worse outage. Review showed it is worse: when
  Postgres stops, every task fails the check at once, ECS stops them all, and the replacements
  cannot start because `connect()` refuses to boot without the database. A database outage
  becomes a restart loop for the whole API, and a restart repairs nothing: `pool.spec.ts` shows
  the same process answering 200 again once the database reopens. So `/health` never touches the
  database, and `/health/db` stays available as a signal for alarms.
- **The 2 s cap lives in `ping`, plus a 2 s `connectionTimeoutMillis` on the pool.** The `ping`
  timer only stops the wait, not the query: against a black-holed host each probe would hold a
  pool slot until the OS gave up on the TCP connect (~2 min), and probes from several ALB nodes
  could fill the pool (`max` 10). `connectionTimeoutMillis` (#2845) releases the slot at the pool
  and also bounds `connect()` at startup. It matches the `ping` cap (v1's `READINESS_TIMEOUT_MS`).
  `query_timeout` / keepalive are still left to #2845.
- **The check arrives as a `buildApp` option.** ESLint forbids `app.ts` and `routes/**` from
  importing `./db`, so `main.ts` composes `ping(db)` and the test harness can swap in
  `async () => false`. `ping` takes the drizzle `Database` rather than the `Pool` because
  `createTestApp` only holds `db`.
- **Hidden from OpenAPI**, like `/docs`: only the load balancer calls it, so a contracts entry and
  a snapshot regeneration would be files for no reader. `openapi.json` is unchanged.
- **Registered at the root**, outside the site plugin, so it skips the preview-token hook and the
  `Vary`/`Cache-Control` handling, and needs no session.

## Open questions

- **alpha-infra still points the target group at `/docs/openapi.json`.** After this deploys and
  the smoke step shows `/health` → 200, `api-v2-ecs.tf` needs `path = "/health"` and
  `matcher = "200"`; the timings no longer depend on the database, so the defaults serve.
  Order matters: flipping the path before the route is live marks the task
  unhealthy and ECS replaces it with one that fails the same check. #3128 closes after that change,
  not on this merge.
- **#3129 (rate limiting)** must exempt `/health` and `/health/db` (`config: { rateLimit: false }`, or keep the
  limiter inside the site plugin) and add a test that repeated probes all return 200.
- `api_v2:lint` is red on `src/import-estate.ts:24` (env read outside the composition root). The
  file and the ESLint config are unchanged from the base `e7eb18fc3`, so the error predates this
  work.
- Each probe writes a "request completed" log line; revisit under #3162 if CloudWatch cost matters.
