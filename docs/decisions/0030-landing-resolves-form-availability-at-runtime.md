# 0030 — Landing resolves form availability at runtime, not at build time

**Date:** 2026-06-03
**Status:** Accepted
**Supersedes:** [0005](./0005-build-time-manifest-for-cross-app-link-availability.md)

## Context

[ADR-0005](./0005-build-time-manifest-for-cross-app-link-availability.md)
made cross-app link availability a **build-time** concern: a pre-build script
(`apps/landing/scripts/fetch-form-manifest.mjs`) fetched the forms team's
canonical list from `${VITE_FORMS_API_URL}/form-definitions` and emitted
`apps/landing/src/content/available-forms.gen.ts`. The landing renderer checked
a page's `form_id` against that baked `AVAILABLE_FORMS` set to decide whether to
render a Start now button.

0005 chose build-time deliberately, on the principle that "stale manifests are
impossible" because the manifest is regenerated on every build. That principle
held only as far as the deploy cadence: the list is frozen into the build and
**does not change until landing is rebuilt and redeployed**. When the forms team
publishes, renames, or removes a form, landing's buttons go missing or point at
the wrong place until the next deploy. This is the "Start links keep going
stale" problem ([#497](https://github.com/govtech-bb/gov-bb/issues/497)). 0005
itself anticipated this and left the door open ("if this becomes a problem in
practice…").

Two delivery options were weighed (see
[docs/plans/landing-runtime-form-manifest.md](../plans/landing-runtime-form-manifest.md)):

1. **Rebuild landing on every forms push + invalidate CloudFront.** Zero
   staleness, but needs a CI pipeline, must bypass the nx build cache (the forms
   API is not an nx input), and adds a full rebuild per publish. A CloudFront
   invalidation alone does *not* fix it — the stale list is baked into the
   build, so invalidation just re-serves the same stale build.
2. **Resolve the list at runtime on the landing server, cached briefly.** Much
   simpler, no new infrastructure, staleness capped at the cache TTL.

## Decision

**Landing resolves the available-forms list at runtime on the server, caches it
for 60 seconds per instance, and keeps the last successfully-fetched list as a
fallback. The build-time manifest mechanism is removed entirely.**

Concretely:

- **A server module** at `apps/landing/src/lib/available-forms.ts` owns
  an in-memory cache `{ ids, fetchedAt }` and exposes a `createServerFn`,
  `getAvailableForms()`, returning the form IDs as a plain array.
  - Fresh (younger than `TTL_MS = 60_000`): return the cached list, no fetch.
  - Stale: refetch `${VITE_FORMS_API_URL}/form-definitions`, validate, update
    the cache, return the new list.
  - Fetch fails with a cached list present: return the **last-known-good** list;
    the buttons do not blank.
  - Fetch fails with no cache (cold start): warn and return `[]` — the page
    renders without Start buttons and self-heals on the next successful fetch.
  - Response validation (shape `{status:"success", data:[{formId}]}`, IDs
    matching kebab-case `^[a-z0-9][a-z0-9-]*$`) is carried over from the old
    pre-build script; a malformed response is treated as a fetch failure.
  - **Cold-start hardening.** The single window where buttons could be missing
    (a fresh instance whose first-ever request hits a down API) is narrowed two
    ways: the cache is **warmed on module load** on the server (guarded by
    `import.meta.env.SSR` so it never ships to the client, and skipped under
    test), and the **cold-start fetch retries** with backoff
    (`COLD_START_RETRIES = 3`, delays `[200, 500, 1000]ms`). Retries apply only
    when there is no cached list — a warm instance always falls back to
    last-known-good instantly, with no added latency during an outage.
- **The fetch is server-side only.** `getAvailableForms()` is called from the
  content route loader (`apps/landing/src/routes/$.tsx`) for the `page` kind —
  the only kind that renders Start buttons. The resolved set is passed to
  `MarkdownContent`, which provides it through `AvailableFormsContext`; the
  anchor renderer reads it from context instead of importing a static manifest.
  The browser never calls the forms API, so the visitor receives a
  fully-rendered page with the buttons already decided — no client loading
  state, no exposure to slow connections.
- **Resolution lives in the route loader, not root `beforeLoad`.** A root
  `beforeLoad` result is resolved once per SSR session and dehydrated/reused
  across client navigations, which would freeze the list for a session.
  Resolving in the loader via a server function consults the cache on the server
  per page load, at the cost of a small server round-trip on client navigation.
- **The build-time mechanism is deleted:** the pre-build script, the `predev`/
  `prebuild` lifecycle hooks, the generated `available-forms.gen.ts`, and its
  gitignore entry are all removed.

## Consequences

- **New forms show up within ~60 seconds, no redeploy.** A published or renamed
  form is reflected on the next page load more than 60s after the last fetch.
- **Freshness is a lazy refresh, not a push.** The list only refreshes when a
  request arrives after the TTL has elapsed. An already-open, untouched page
  does not self-update; freshness lands on the next navigation or reload. For a
  content site, normal browsing means essentially everyone sees a new form
  within ~60s. Client-side polling was explicitly rejected — it would push the
  loading/connectivity burden back onto the user.
- **The build no longer depends on the forms API.** This removes the
  offline-build limitation noted in `CLAUDE.md` (landing's prebuild used to fail
  offline) and removes the "API outage at build time = build failure" tradeoff
  that 0005 accepted.
- **Two-layer fallback, not three.** Removing the build-time seed drops the
  fallback chain to *fresh list → last-known-good in memory*. The only blank
  case is a brand-new server instance, on its very first request ever, while the
  forms API is down — self-healing on the first successful fetch. Warm-on-boot
  and cold-start retries (above) narrow this to a *sustained* outage coinciding
  with a fresh instance. Judged an acceptable trade for the simplicity and the
  offline-build win; a shared last-known-good store would close it entirely but
  reintroduces infra and is deferred.
- **Per-instance cache.** Each Amplify compute instance caches independently, so
  the effective API call rate is ~1 per instance per 60s. Acceptable at this
  scale, and the periodic call doubles as a lightweight health signal.
- **Frontmatter convention is unchanged.** Pages still declare `form_id` in
  frontmatter and place a `<a data-start-link>` anchor in the body; only the
  source of the availability set changed (runtime fetch vs. baked manifest).
- **`VITE_FORMS_API_URL` is now a runtime server var,** read via `process.env`
  in the server function, rather than a build-time-only var.
