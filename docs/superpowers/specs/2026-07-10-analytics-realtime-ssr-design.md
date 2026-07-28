# Real-time, per-form analytics dashboard (SSR, no DB)

**Date:** 2026-07-10
**Branch:** `feat-consolidated-analytics-dashboard`
**Status:** Approved design — pending implementation plan

## Summary

Rebuild the `/analytics` dashboard so it fetches Umami data **server-side in
real time**, with **no database** and **no committed snapshot**. The landing
page shows a slim site-wide overview plus a list of forms; a form's funnel,
journey and submit-error rate are fetched **on click**, one form at a time.

This is enabled by Umami's own server-side **report endpoints**
(`POST /api/reports/funnel`, `POST /api/reports/journey`), which return
distinct-visitor funnels and navigation paths in a *single* request — removing
the need for the slow per-session `/activity` crawl that previously forced a
precomputed snapshot.

## Starting point (ground truth on the branch)

The DB + cron + `GET /analytics/report` direction described in PR #1934 was
reverted by the merge from `origin/sandbox`. As of this design the actual code
is:

- `apps/analytics` — a **static Vite React SPA** (`main.tsx` →
  `createRoot().render(<AnalyticsPage/>)`), no server runtime.
- Data — a **committed static snapshot** (`apps/analytics/src/content/analytics-snapshot.json`),
  bundled at build time via `src/lib/report.ts` (`REPORT`), produced offline by
  `apps/analytics/scripts/generate-analytics-snapshot.ts` (runs the session crawl
  on a developer machine).
- Deployed as static `dist` on Amplify (`amplify.yml`, `appRoot: apps/analytics`,
  `baseDirectory: apps/analytics/dist`).
- **No** api-side analytics code, entity, migration, cron, or `umami.config.ts` —
  all already absent. `git diff main..HEAD` for analytics is empty.

So "retire the database" is already done. What remains to retire is the
static-snapshot machinery.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Where the real-time Umami call lives | **`apps/analytics` SSR directly** — self-contained; key in Amplify SSR env; api not involved |
| 2 | Form list source | **Authoritative published-forms list** (`GET /form-definitions`) — stable, real titles |
| 3 | Main page scope | **Slim site overview + form list** — cheap aggregate calls only; expensive per-form work deferred to click |
| 4 | Per-form detail | **Coarse funnel + journey + submit-error rate** — each a single report/metrics call; per-step (#1915) dropped (needs step-in-URL, blocked on #1931) |
| 5 | Cleanup scope | **Full retirement** of the static-snapshot machinery |
| 6 | Rate-limiting / duplicate calls | **~60s in-memory TTL memo** in the SSR process (not persistence) |

Funnel semantics note: Umami's funnel report counts distinct **visitors**, not
distinct **sessions** as the old `sessions.ts` did. Slightly different
denominator; acceptable and arguably more meaningful ("how many people
completed").

## Architecture

`apps/analytics` becomes a **self-contained TanStack Start (Nitro) SSR app** —
the same stack `landing` uses and that the reverted `report.ts` used via
`createServerFn`. A static SPA cannot do server-side fetching or safely hold the
API key, so SSR is required for decision #1.

```
Browser ──▶ apps/analytics (TanStack Start SSR on Amplify SSR compute)
                 │  server functions (key never leaves the server)
                 ├─ overview  ──▶ Umami landing website: /stats, /metrics
                 ├─ form list ──▶ GET /form-definitions (forms API, public)
                 └─ per form  ──▶ Umami forms website:
                                    POST /reports/funnel
                                    POST /reports/journey
                                    /metrics (form-submit-error count)
                 └─ ~60s in-memory TTL memo around each Umami call
```

**Env (Amplify SSR):** `UMAMI_API_KEY`, `UMAMI_LANDING_WEBSITE_ID`,
`UMAMI_FORMS_WEBSITE_ID`. Injected into Nitro runtime config at build (mirrors
the `VITE_API_URL` pattern in the reverted `report.ts`) so the SSR Lambda reads
them at runtime, not from `process.env` at request time.

## Components

### `@govtech-bb/umami-analytics` (package)

- **Keep:** `UmamiClient` (thin REST client, throttle + retry), `metrics.ts`,
  `dates.ts`, `types.ts`.
- **Add** to `UmamiClient`:
  - `reportFunnel(websiteId, { steps, window, range }) → FunnelStep[]` —
    `POST /reports/funnel`, body
    `{ websiteId, type: "funnel", parameters: { startDate, endDate, steps, window } }`,
    where each step is `{ type: "event" | "path", value }`. Response rows:
    `{ type, value, visitors, dropped?, dropoff }`.
  - `reportJourney(websiteId, { steps, startStep, endStep?, range }) → JourneyPath[]` —
    `POST /reports/journey`.
  - Both use the existing `x-umami-api-key` header + throttle; add a `post()`
    sibling to the private `get()`.
- **Remove:** `sessions.ts` (+ spec), the package's `report.ts`,
  `collectSessions`/`listSessions`/`sessionActivity`/`sessionsPage` from
  `UmamiClient` (crawl-only surface no longer used).

### `apps/analytics` (SSR app)

- Convert `main.tsx` static bootstrap → TanStack Start router + Nitro SSR
  (`router.tsx`, `routes/__root.tsx`, `routes/index.tsx`, `routeTree.gen.ts`,
  `vite.config.ts` with the start/nitro plugins).
- **`src/lib/analytics.ts`** — server functions:
  - `fetchOverview()` — landing `/stats` + `/metrics` (top pages, device,
    country) + `GET /form-definitions` → `{ stats, pages, forms: {formId,title}[] }`.
  - `fetchFormDetail(formId)` — forms-website `reportFunnel` (steps
    `[<id>:form-start, <id>:form-review, <id>:form-submit]`, `window` TBD default
    e.g. 60), `reportJourney`, and submit-error count → `{ funnel, journey, submitErrorRate }`.
  - Each wrapped in the TTL memo; degrade to an empty/"unavailable" shape on
    error so the page always renders.
- **`AnalyticsPage.tsx`** — reuse the existing layout (overview tables + click
  drawer). Swap the static `REPORT` import for loader data; the form drawer
  calls `fetchFormDetail` on open. Drop the field-error / validation-reason
  tables and per-step funnel (out of scope per decision #4). Keep the funnel bar
  chart, add a journey list and the submit-error stat.

### Retire

- `apps/analytics/src/content/analytics-snapshot.json`
- `apps/analytics/scripts/generate-analytics-snapshot.ts` + the
  `generate:analytics` package script
- session-crawl code listed above

### Deploy

- `amplify.yml` analytics block: static `dist` artifact → SSR output
  (TanStack Start / Nitro Amplify preset, matching `landing`). Add the three
  `UMAMI_*` env vars to the analytics Amplify app.

## Error handling

- Missing/invalid `UMAMI_*` env → overview and form detail return an
  "unavailable" state; the page renders a clear message rather than throwing.
- Any Umami non-2xx / network error inside a server function → caught, degraded
  to empty data for that section (page still renders). `UmamiClient` already
  retries 429/5xx and transient network errors.
- A form with no funnel events → funnel renders with zeroes, not an error.

## Testing

- Package unit tests: `reportFunnel` / `reportJourney` map Umami's documented
  request/response shapes correctly (mocked `fetch`); step construction for a
  `formId` yields `[<id>:form-start, <id>:form-review, <id>:form-submit]`.
- App tests: `fetchOverview` / `fetchFormDetail` assemble the expected shape
  from mocked client calls and degrade on error; TTL memo returns cached result
  within the window and refetches after it.
- SSR smoke: `/` renders the overview + form list; opening a form drawer renders
  funnel + journey + submit-error.

## Open risks / verify during implementation

1. **`GET /form-definitions` is public and returns `{ formId, title }[]`** for
   published forms (landing consumes it — confirm shape + no auth).
2. **Recipe `formId` == the Umami event prefix** (`<formId>:form-start`). Spot
   check against real event names before trusting the funnel steps.
3. **Report endpoints accept the `x-umami-api-key` header** (same as GET
   endpoints) and the `{ websiteId, type, parameters }` envelope on Umami Cloud.
4. **Funnel `window`** (max minutes between steps) — pick a sensible default
   (start→submit can span a long single session); validate against real data.
5. **Amplify SSR support for TanStack Start/Nitro** for this app (landing proves
   the pattern; confirm the analytics Amplify app can run SSR compute, given its
   auto-build-off standalone setup).

## Out of scope

- Per-step reached-vs-completed funnel (#1915) — blocked on step-in-URL (#1931).
- Field-level validation errors and validation-reason breakdown (needed the
  event-data/crawl path).
- Site-wide session flow / Sankey and site-wide journeys (crawl-derived).
