# api_v2 gets a `/health` route that checks the database (#3128)

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

## Why we did it that way

- **One DB-backed route, no separate liveness route.** The only consumer is the ALB, and ALB
  health both gates routing and makes ECS replace the task. The risk weighed was a Postgres blip
  killing every task. Walking it through: during a blip the app already answers 500, so pulling
  it from rotation costs visitors nothing (landing falls back either way, #3134); if the blip
  outlasts the threshold ECS churns replacements that can't boot until Postgres returns, which is
  churn, not a worse outage. What the DB check buys is replacing a task whose pool is wedged
  while the database is fine. A DB-less check can never do that. Blip tolerance belongs in the
  target group's `interval × unhealthy_threshold`, not in a weaker check. Nothing would probe a
  liveness route (no Kubernetes, no Dockerfile `HEALTHCHECK`), so v1's `/health` + `/health/ready`
  split was not copied.
- **The 2 s cap lives in `ping`, not on the pool.** The pool has no `connectionTimeoutMillis` or
  `query_timeout`, so a black-holed database hangs a query indefinitely. A pool-wide timeout
  would fix that for every route but would also 500 a slow legitimate visitor query — a different
  risk, left to #2845. The cap is v1's `READINESS_TIMEOUT_MS`: answer a clean 503 before the
  ALB's own timeout fires. The losing query is left to settle; probes come every ~30 s.
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
  the smoke step shows `/health` → 200, `api-v2-ecs.tf` needs `path = "/health"`,
  `matcher = "200"`, `timeout` ≥ 5, `interval = 30`, `unhealthy_threshold = 3`,
  `healthy_threshold = 2`. Order matters: flipping the path before the route is live marks the task
  unhealthy and ECS replaces it with one that fails the same check. #3128 closes after that change,
  not on this merge.
- **#3129 (rate limiting)** must exempt `/health` (`config: { rateLimit: false }`, or keep the
  limiter inside the site plugin) and add a test that repeated probes all return 200.
- `api_v2:lint` is red on `src/import-estate.ts:24` (env read outside the composition root). The
  file and the ESLint config are unchanged from the base `e7eb18fc3`, so the error predates this
  work.
- Each probe writes a "request completed" log line; revisit under #3162 if CloudWatch cost matters.
