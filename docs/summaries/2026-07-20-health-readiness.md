# Session summary — DB-backed readiness probe (#2001)

**Date:** 2026-07-20 · **Branch:** `feat-2001-health-readiness` (off `main`)

## What shipped

The API's `/health` returned a static `"OK"` and checked nothing (its Swagger
even falsely claimed it "verifies the dependency graph"), so a task with a dead
DB still reported healthy and the load balancer kept routing to it. Added a new
`GET /health/ready` that runs `await dataSource.query("SELECT 1")` → returns
`"OK"` (200) or throws `ServiceUnavailableException` (503) when the DB is
unreachable. `/health` stays as the cheap liveness check (its description was
corrected to say so).

## Why it looks the way it does

- **Liveness vs readiness split.** A DB check must NOT sit on a probe that decides
  container *restarts*, or a transient DB blip causes restart storms. So the DB
  check went on a *new* readiness endpoint; `/health` stays dependency-free
  (liveness). This is the one design decision that mattered.

- **`SELECT 1`, no library, no `HealthService`.** `DataSource` is already in the
  DI container (`main.ts` does `app.get(DataSource)`), so a 5-line query needs no
  new dependency — `@nestjs/terminus` would be overkill for a single check. Per
  the owner's call, the DB is queried straight from `AppController` (no service
  layer) to keep the PR minimal.

- **`/health` left as-is** apart from an honest one-line description fix.

## Out of scope (follow-up, needs infra)

The value lands in production only once the traffic-routing probe points at
`/health/ready`: the docker-compose api healthcheck (`docker-compose.yml:118`)
and the AWS ALB target-group check currently hit `/health`. Rewiring them is
deploy/infra config — a separate step, and it needs confirming which probe is
liveness (restart) vs routing so readiness attaches to the routing one.

## Verification

`app.controller.spec.ts`: `health()` → OK; `ready()` → 200 when the query
resolves, 503 when it rejects. Controller spec 3/3; `api:build` compiles; full
api suite 1168 pass — the one failure is the known unrelated local-DB migration
smoke test. Adding the `DataSource` constructor dependency raised no
DI-resolution errors.
