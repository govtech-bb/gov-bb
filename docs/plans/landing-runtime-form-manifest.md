# Plan — Landing fetches the forms list at runtime (Option 2)

**Status:** Draft for review
**Issue:** [#497](https://github.com/govtech-bb/gov-bb/issues/497) — "Start now" links go stale
**Supersedes (decision):** [ADR-0005](../decisions/0005-build-time-manifest-for-cross-app-link-availability.md)
**Related plan:** [fix-landing-start-links.md](./fix-landing-start-links.md) (content/authoring side of #497; this plan is the deploy/freshness side it punted on)

## Goal

A newly published, renamed, or removed form shows up on the landing site
within about a minute — **with no redeploy and no rebuild**. Today the forms
list is baked into the build, so it only changes when landing is rebuilt and
redeployed; buttons go missing or point at the wrong place until then.

User-facing outcome: Start now buttons stay correct on their own, and a brief
forms-API outage never blanks the buttons.

## Approach

Fetch the forms list **live on the landing server**, cache it for **60
seconds**, and keep the **last good list** in memory as a fallback. The
browser never talks to the forms API — the server resolves the list during
SSR, so visitors always get a fully-rendered page with the buttons already
decided (no spinner, no exposure to slow connections). The entire build-time
manifest mechanism is removed.

```
   BROWSER                    LANDING SERVER                 FORMS API
      │  open page              │                              │
      │ ───────────────────────>│  check 60s "sticky note"     │
      │                         │ ── if stale ───────────────> │
      │                         │ <─────────────────────────── │
      │  fully-built page       │  draw buttons into the page  │
      │ <───────────────────────│                              │
      ▼  (buttons already there) ▼                              ▼
   The browser NEVER calls the forms API. Only the server does.
```

**How the 60s cache behaves (lazy refresh, not a push):**

```
  request arrives → how old is the cached list?
        < 60s  ──► use as-is, NO api call          (fast path)
        ≥ 60s  ──► fetch fresh, update cache, use the new list
        fetch fails ──► keep serving LAST-KNOWN-GOOD (never blank)
```

The list only refreshes **when a request triggers it** after 60s — there is no
timer pushing updates to already-open pages. Freshness lands on the next
server render (new visitor, reload, direct URL, or a navigation that hits the
server). For a content site, that means essentially everyone sees a new form
within ~60s of normal browsing. An idle, untouched open page does not
self-update — accepted, and the explicit reason we are **not** doing
client-side polling.

### Alternatives considered

- **Option 1 — rebuild landing on forms push + CloudFront invalidation.**
  Zero staleness, but needs a CI pipeline (forms push → rebuild → invalidate),
  must bypass the nx build cache (the forms API isn't an nx input), and adds a
  full rebuild per publish. More moving parts; deferred as a possible later
  enhancement.
- **Client-side fetch (react-query in the browser).** Simpler to reach
  "open pages auto-update," but puts the loading state and slow-connection /
  connectivity risk back on the user — the concern Shannon raised. Rejected.
- **Keep the build-time manifest as a cold-start seed (3-layer fallback).**
  Considered, then explicitly dropped: the decision is to **totally remove**
  the build-time fetch (see Scope). Trade-off recorded under Risks.

## Scope

- Add a **server-side cached fetch** for the forms list:
  - In-memory cache `{ ids: ReadonlySet<string>, fetchedAt: number }`.
  - `TTL_MS = 60_000` as a named constant (not env-configurable for now).
  - Fresh → return cached; stale → refetch `${VITE_FORMS_API_URL}/form-definitions`,
    validate, update cache; fetch failure → return last-known-good.
  - Reuse the existing response validation/ID-pattern logic from the old
    `fetch-form-manifest.mjs` (status `success`, `data[].formId`, `^[a-z0-9][a-z0-9-]*$`).
  - Cold start + no cache + API down → return empty set, `console.warn`, render
    page without Start buttons. Never throw.
- **Harden the cold-start window** (the only case where buttons can be missing):
  - **Retry on cold start** — when there is no cached list to fall back on, the
    fetch retries a few times with backoff (`COLD_START_RETRIES = 3`, delays
    `[200, 500, 1000]ms`) before giving up. Retries apply *only* to the
    cold-start path; a warm instance with a cached list still falls back to
    last-known-good instantly (no added latency during an outage). `sleep` is
    injectable so tests don't wait on real timers.
  - **Warm on boot** — kick off a fetch when the module loads on the server so
    the first request finds the cache populated. Guarded by
    `import.meta.env.SSR` (stripped from the client bundle) and a
    `NODE_ENV !== 'test'` check (no real network calls under test).
- Expose the set to render via a **`createServerFn` called from the
  content-route loader(s)** that render form-bearing pages (`$.tsx`, and the
  explicit `*.form.tsx` routes if they gate on availability). **Decided:** this
  approach, not root `beforeLoad` — `beforeLoad`'s result is dehydrated and
  reused across client navigations (no server round-trip), which would freeze
  the list for an SPA session. Resolving in the loader via a server function
  guarantees the cache is consulted on the server per page load (accepting a
  small server round-trip on client navigation). Pass the resolved set down to
  `MarkdownContent`.
- **Rewire the consumer:** `StartLinkFromContext` reads the available-forms set
  from props/context instead of importing `available-forms.gen.ts`.
- **Remove the entire build-time mechanism:**
  - Delete `apps/landing/scripts/fetch-form-manifest.mjs`.
  - Remove `prebuild` and `predev` scripts from `apps/landing/package.json`.
  - Delete the generated `src/content/available-forms.gen.ts` and its imports.
  - Side benefit: the build no longer depends on the live forms API, fixing the
    offline-build limitation noted in `CLAUDE.md`.
- **Record the decision:** new ADR superseding ADR-0005 (runtime fetch + 60s
  cache + last-known-good; build-time manifest removed and why).

## Files

**Add**
- `apps/landing/src/lib/available-forms.ts` — the cached fetch + cache state + validation (createServerFn).
- `docs/decisions/00XX-landing-resolves-form-availability-at-runtime.md` — new ADR superseding 0005.

**Modify**
- `apps/landing/src/components/MarkdownContent.tsx` — read available-forms set from props/context; drop the static import.
- `apps/landing/src/routes/$.tsx` — loader resolves the set via the server fn and passes it through.
- `apps/landing/src/routes/*.form.tsx` — same wiring where they render Start buttons (audit which gate on availability).
- `apps/landing/package.json` — remove `prebuild` / `predev` (and `fetch-form-manifest` script).
- `apps/landing/src/lib/frontmatter.ts` — update the stale comment referencing the build-time manifest.
- ADR-0005 — mark `Status: Superseded by 00XX`.

**Delete**
- `apps/landing/scripts/fetch-form-manifest.mjs`
- `apps/landing/src/content/available-forms.gen.ts` (generated; also gitignored)

## Verify

- **Unit (cache logic):** fresh hit returns cached without fetching; stale
  triggers refetch and updates `fetchedAt`; fetch failure returns
  last-known-good; cold-start + failure returns empty set and warns; invalid
  response shape is rejected; cold-start retries then succeeds once the API
  recovers; cold-start gives up after exhausting retries; a stale cached list
  does NOT retry (instant fallback, no `sleep`).
- **Render:** a page whose `form_id` is in the set renders `StartLink`; one not
  in the set suppresses the button (warns in dev). Existing MarkdownContent
  tests that mocked `AVAILABLE_FORMS` move to providing the set via props/context.
- **Manual (the `/verify` skill):** run landing locally, confirm Start buttons
  render via SSR (visible in initial HTML, no client fetch in the network tab);
  point `VITE_FORMS_API_URL` at a stubbed/blocked endpoint and confirm buttons
  stay up from last-known-good and the page still renders when cold + down.
- **Build:** `pnpm exec nx run-many -t build` and `-t test` green; confirm
  landing now builds with the forms API unreachable (no prebuild dependency).

## Risks / trade-offs (accepted)

- **No cold-start seed.** Removing the build-time manifest drops the fallback
  chain from three layers to two (**fresh → last-known-good**). The only blank
  case: a brand-new server instance, on its very first request ever, while the
  forms API is down. Self-heals on the first successful fetch. **Narrowed** by
  warming the cache on boot and retrying the cold-start fetch with backoff
  (above), so it now takes a *sustained* outage coinciding with a fresh
  instance — not a momentary blip — to surface. Judged an acceptable trade for
  the simplicity and the offline-build win. A shared last-known-good store
  (S3/DynamoDB/Redis) would close it entirely but reintroduces infra; deferred
  unless it bites in production.
- **Per-instance cache.** Each Amplify compute instance has its own in-memory
  cache, so the effective API call rate is ~1 per instance per 60s. Matches the
  thread's expectation; not a concern at this scale.
- **Idle open pages don't self-update.** By design (no client polling).
  Freshness lands on the next navigation/reload.

## Open questions

1. **Which `*.form.tsx` routes actually gate on availability** vs. always
   render — audit during implementation to know the full consumer list.
2. **TTL value** — 60s per the team thread. Keep hard-coded, or read from an
   env var for ops tuning? Plan assumes hard-coded constant for now.

_Resolved: the set is resolved in the content-route loader via `createServerFn`
(not root `beforeLoad`) — see Scope/Approach._

---

_Next step: implement in a separate session (`/bb:dev-start`)._
