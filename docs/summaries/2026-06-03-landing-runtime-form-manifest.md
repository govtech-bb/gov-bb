# Landing resolves the forms list at runtime, not at build time (#497)

## Context

Landing's "Start now" buttons render only when a page's `form_id` is in the
forms team's canonical list (`/form-definitions`). That list was **baked into
the build** by a pre-build script (ADR-0005): it only changed on redeploy, so
when the forms team published or renamed a form, buttons went missing or pointed
at the wrong place until the next deploy — the "stale links" problem (#497).

A Slack thread weighed two fixes: (1) rebuild landing on every forms push +
invalidate CloudFront — zero staleness but a new CI pipeline and an nx-cache
bypass; or (2) fetch the list live at runtime, cached briefly. The team chose
**Option 2** for simplicity and no new infra. Plan:
`docs/plans/landing-runtime-form-manifest.md`.

## What we did

- **New** `apps/landing/src/lib/available-forms.ts` — a `createServerFn`
  (`getAvailableForms`) over a per-instance in-memory cache: fresh (<`TTL_MS`,
  60s) serves cached, stale refetches, fetch-failure serves last-known-good,
  cold-start+failure returns `[]` and warns. Pure, tested `parseFormIds` /
  `resolveAvailableForms` (validation carried over from the old script).
- **Cold-start hardening** (Options A + B from the discussion): the cold-start
  fetch **retries** with backoff (`COLD_START_RETRIES = 3`, `[200,500,1000]ms`),
  and the cache is **warmed on module load** on the server.
- `apps/landing/src/routes/$.tsx` — loader is now async and calls the server fn
  **only on the `page` kind** (the only kind with Start buttons), threading the
  list to `MarkdownContent`.
- `apps/landing/src/components/MarkdownContent.tsx` — reads the set from a new
  `AvailableFormsContext` instead of the static manifest import.
- **Removed the build-time mechanism**: deleted `scripts/fetch-form-manifest.mjs`
  and `available-forms.gen.ts`, dropped the `prebuild`/`predev` hooks and the
  gitignore entry, updated stale comments in `frontmatter.ts` and `.env.example`.
- **ADR-0030** records the decision (supersedes 0005). Tests: 11 new
  (cache/parser/retry), preview-gating test updated for the async loader.

## Why we did it that way

- **Server-side fetch, resolved in the route loader.** The fetch runs only on
  the Nitro server, so the browser never calls the forms API and the visitor
  gets a fully-rendered page with the buttons already decided — no client
  loading state, no slow-connection exposure (Shannon's concern). We resolve in
  the **loader via a server function**, *not* root `beforeLoad`: a `beforeLoad`
  result is dehydrated and reused across client navigations, which would freeze
  the list for a session. The loader consults the cache on the server per page
  load, at the cost of a small server round-trip on client navigation.
- **Lazy refresh, not a push.** The list refreshes on the next request after the
  TTL; already-open pages don't self-update. Client-side polling was rejected for
  the same loading/connectivity reason.
- **Build-time mechanism removed entirely** (no cold-start seed kept), per an
  explicit "totally wipe it" call. This drops the fallback to two layers (fresh →
  last-known-good) but also removes the build's dependency on the forms API,
  fixing the offline-build limitation in `CLAUDE.md`. The remaining blank window
  — a brand-new instance whose first-ever request hits a down API — is narrowed
  by warm-on-boot + cold-start retries, so it now needs a *sustained* outage to
  surface, and it self-heals on the first success. A shared last-known-good store
  (S3/DynamoDB/Redis) would close it entirely but was deferred as infra we don't
  need yet.
- **Retries are cold-start-only.** A warm instance with a cached list falls back
  to last-known-good instantly — retries would add latency to a normal page load
  during an outage, so they apply only when there's nothing to fall back on.
- **Module renamed off the `.server.ts` suffix.** TanStack Start hard-denies
  `**/*.server.*` imports from client-reachable code; the established pattern
  here (`lib/preview.ts`) is a plain filename with `createServerFn` doing the
  split. The warm-on-boot side effect is guarded by `import.meta.env.SSR` (Vite
  strips it from the client bundle) and `NODE_ENV !== 'test'` (no network in
  vitest).

## Notes / follow-ups

- Open question resolved by the code: only `$.tsx`/`MarkdownContent` consume the
  list — the `*.form.tsx` calculator routes don't gate on availability.
- Folded out `console.table(...)` debug lines that had been left on the hot path
  (they would have logged on every render).
- Incidental `apps/forms/src/routeTree.gen.ts` churn from `forms:build` was left
  out of the commits.
