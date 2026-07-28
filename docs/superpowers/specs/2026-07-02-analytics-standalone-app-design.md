# Standalone `apps/analytics` dashboard — design

Date: 2026-07-02
Supersedes: PR #1808 (landing-integrated `/analytics`), which will be closed.

## Goal

Move the Umami analytics dashboard from being integrated into `apps/landing`
(PR #1808) into its own standalone, separately-deployed app at `apps/analytics`.

## Context

PR #1808 is **open and unmerged**. Its final state is a static, committed
snapshot (`analytics-snapshot.json`) rendered entirely client-side — no server
functions, no request-time Umami calls. Its only real coupling to landing is:

1. `PAGES` (landing content registry) → maps `form_id` to title/category for
   the form rows, via an `enrich()` step in the route.
2. `@govtech-bb/react` design-system components (shared package — fine).
3. Landing's TanStack Start / Nitro / Vite build.

Because this work lands on a **fresh branch off `sandbox`** and #1808 never
merged, landing on `sandbox` has no analytics route — so there is **no landing
cleanup to do**. The task is to land #1808's work as a new app instead.

## Decisions (agreed)

- **Standalone deployed app** — its own Amplify app + domain, own build.
- **Plain Vite + React SPA** — no SSR/Nitro. The page renders a bundled static
  snapshot, so SSR buys nothing.
- **Public** — viewable by anyone with the URL (as in #1808). `robots: noindex`.
  The API key never reaches the browser (it is only used by the manual refresh
  tool). Gating is a possible follow-up, not in scope.
- **Fresh branch off `sandbox`** (`analytics-standalone-app`), new PR; close
  #1808 referencing the new PR.

## Architecture — two layers

### 1. Runtime app — `apps/analytics` (Vite + React SPA)

A dumb renderer of a committed JSON snapshot. Depends only on shared packages:

- `@govtech-bb/umami-analytics` — view-model types
- `@govtech-bb/react` — Heading/Text/Select + design tokens

No SSR, no server fns, no runtime Umami calls, **no `apps/landing` dependency.**

Files:

- `index.html`, `src/main.tsx` — SPA mount point
- `src/AnalyticsPage.tsx` — #1808's `analytics.tsx` with the `createFileRoute`
  wrapper **and** the `PAGES` / `enrich()` block removed (rows arrive
  pre-enriched from the snapshot)
- `src/content/analytics-snapshot.json` — the committed snapshot
- `src/lib/report.ts` — imports + type-casts the snapshot (was
  `umami-analytics.ts`)
- `vite.config.ts` — `@vitejs/plugin-react`, `vite-tsconfig-paths`
- `tsconfig.json` — `references` `packages/umami-analytics`
- `project.json` — nx `build` / `serve` / `lint` / `test` targets
- Tailwind wiring so `@govtech-bb/react` components render styled (replicating
  landing's Tailwind + design-token setup)

### 2. Refresh tool — `apps/analytics/scripts/generate-analytics-snapshot.ts`

The only code that touches content, and only through the shared
`@govtech-bb/content` package (never `apps/landing`):

- Fetches + aggregates Umami as today (unchanged).
- **New:** enriches each form row with `title` (via `loadContent()`) and
  `category` display label (via `categoryForForm()` + the category taxonomy),
  baking them into the snapshot so it is self-describing.
- Run manually: `pnpm --filter @govtech-bb/analytics-app generate:analytics`,
  then commit the updated JSON to publish.

This removes the `enrich()` logic from the page.

## Data flow

`generate:analytics` (Node; reads `LANDING_CONTENT_DIR` + `UMAMI_*` creds) →
writes enriched `analytics-snapshot.json` → committed → bundled by Vite →
`AnalyticsPage` renders it client-side. Preset switching and the drill-down
drawer stay entirely client-side.

## `packages/umami-analytics`

Moves untouched (already a self-contained shared package). Keeps its 25 unit
tests. The CLI report (#1795) continues to have its own copy; migrating it to
this package remains a separate follow-up.

## Deployment

Static SPA → its own Amplify app (new app, own domain). Build =
`nx build analytics`, artifacts = `dist`. Because the snapshot is committed and
bundled, **the deploy needs no `UMAMI_*` env** — creds are only for the local
refresh tool. Creating the Amplify app is a console action (out of repo); any
required build config (`amplify.yml` / build spec) will be added as needed.

## Testing

- `packages/umami-analytics` — existing 25 unit tests stay green.
- `apps/analytics` — a smoke render test: the page renders from a fixture
  snapshot and preset switching works.
- `pnpm exec nx run-many -t build --exclude=landing` clean; targeted tests
  green.

## Risks / open details (not blockers)

1. **`@govtech-bb/react` styling in a bare SPA** — landing configured Tailwind +
   design tokens; the new app must replicate that or design-system components
   render unstyled. Handled during implementation.
2. **Regenerating the snapshot** — baking title/category requires re-running the
   generator with local `UMAMI_*` creds. If inconvenient, do a one-time in-place
   enrich of the existing committed JSON instead.
