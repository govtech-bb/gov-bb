# Gate landing content on runtime `service_status` — Design

**Date:** 2026-07-08
**Status:** Approved
**Follows:** service_status API (#1876, #1886), services index endpoint
(2026-07-07-services-index-endpoint-design.md), feature-flagging admin UI (#1650
/ #1898).
**Branch base:** `main`; PR targets `main`.

## Problem

The feature-flagging admin UI writes service visibility to a DB table via
`PUT /service_status`, but nothing public-facing consumes it. `apps/landing`
gates content two ways today — a build-time frontmatter **visibility** gate
(`public`/`preview`/`draft`) and a runtime **forms-API maintenance/available**
gate — and neither reflects an admin's runtime toggle. So toggling a service in
the admin tool has no effect on the live site until a content redeploy.

Wire landing to consume the DB-backed `GET /service_status` at runtime so admin
toggles gate public content without a landing redeploy.

## Decisive facts

1. `GET /service_status` is served by the **same `apps/api` host** landing
   already reaches through `VITE_FORMS_API_URL` (that host also serves
   `/form-definitions`, `/feedback`, `/services`). **No new env var.**
2. The read is a **public, unauthenticated** endpoint
   (`ServiceStatusController.list`) — landing needs no token.
3. Response: `{ status:"success", data: [{ slug, status }] }`,
   `status ∈ { enabled, form_disabled, disabled }`, keyed by the **hierarchical
   content slug** — the same key as the registry's `BY_SLUG`.
4. The registry's visibility core `resolvePageLevel(slug, visibilityOf)` already
   takes an **injectable** `visibilityOf`, which is the natural seam for an
   overlay.

## Decisions (locked)

- **Source of truth:** `GET /service_status` (runtime toggles), not the static
  `/services` content snapshot.
- **Precedence:** a status row **overrides** for its slug; no row → today's
  behavior (frontmatter visibility + forms-API maintenance). Additive — nothing
  removed.
- **Failure mode:** last-known-good, then frontmatter default. The site never
  goes down over a status outage.
- **Integration:** Approach A — thread an optional overlay through the registry
  gate functions (consistent gating across page + listings + search + sitemap).

### Status → landing behavior

| status | Effect | Reused mechanism |
|---|---|---|
| `enabled` | normal | — |
| `form_disabled` | page shows; form unreachable → "Start now" hidden + MaintenanceNotice | existing `underMaintenance` / `availableForms` path |
| `disabled` | page hidden from public: 404 + noindex + dropped from listings/search/sitemap; **preview cookie unlocks** | existing visibility gate, mapped to level `preview` |

### Precedence detail (the overlay)

Two overlays are derived from the one fetched status map:

1. **Visibility overlay** (for the gate functions), a `Map<slug, ViewLevel>`:
   - `disabled` → `preview`
   - `enabled` → `public`
   - `form_disabled` → (no entry; visibility unchanged)
2. **Form-reachability overlay** (for the `$.tsx` page loader): slugs with
   `form_disabled` → the page's `form_id` is forced into the maintenance path
   (removed from `availableForms`, added to the maintenance set → notice +
   hidden Start button).

**Sharp edge (accepted):** because a row *overrides*, an `enabled` row on a page
whose frontmatter is `draft` makes it **public** — the admin tool is the launch
switch. The derivation is isolated in one pure function, so softening this to
"`enabled` only clears a `disabled` state" is a one-line change if we reconsider.

## Components

### 1. `apps/landing/src/lib/service-status.ts` (new)

A near-clone of `available-forms.ts`:
- `getServiceStatuses()` — a `createServerFn` returning the status map as
  serializable entries (`Array<[slug, status]>`); the consumer builds a `Map`.
- Per-instance TTL cache (60s), last-known-good fallback, cold-start retries,
  module-load warm fetch (`import.meta.env.SSR` + `NODE_ENV !== 'test'` guards).
- Pure, injectable core `resolveServiceStatuses({ now, ttlMs, fetcher, cache,
  … })` and pure `parseServiceStatuses(payload)` (validates
  `{status:"success", data:[{slug,status}]}`, rejects unknown status values and
  non-string slugs so a malformed response falls back rather than yielding
  garbage). Reuses the same base-URL/env plumbing as `formsApiBase()`.
- Helper `deriveVisibilityOverlay(statuses) → Map<slug, ViewLevel>` (pure) and
  `deriveFormDisabledSlugs(statuses) → Set<slug>` (pure).

### 2. `apps/landing/src/content/registry.ts` (threaded overlay)

Add an optional `overlay?: ReadonlyMap<string, ViewLevel>` parameter to the
public gate functions, composed over frontmatter in the existing
`resolvePageLevel` seam:

```ts
visibilityOf = (slug) => overlay?.get(slug) ?? BY_SLUG.get(slug)?.frontmatter.visibility
```

Functions updated (all keep today's behavior when `overlay` is omitted):
`pageLevel`, `isVisible`, `urlLevel`, `isUrlVisible`, `categoryServices`,
`isCategoryVisible`, `startSubPageLevel`, `isStartSubPageVisible`. The overlay is
applied per-slug in the ancestor walk, so a `disabled` parent gates its
sub-pages exactly like a `preview`/`draft` parent does today.

### 3. Consumers (thread the overlay through)

Each SSR gate call site fetches the status map (server-side, cached) and passes
the derived overlay:

- `routes/$.tsx` — category, subcategory, and page branches; the page branch
  also applies the **form-reachability overlay** to `availableForms` /
  `underMaintenance`.
- `routes/index.tsx`, `routes/services.tsx` — listing gates.
- `lib/search.ts` — `isUrlVisible` filter.
- `lib/sitemap.ts` — `isVisible` / `isCategoryVisible` (public viewer).
- `routes/**/form.tsx`, `routes/**/route.tsx` (3 feature routes) — `isUrlVisible`
  / `urlLevel` gate on their owning content URL.

Freshness: fetched in loaders (per navigation, server-side), so a toggle
surfaces on the next navigation/refresh within the 60s cache — mirroring
`availableForms`.

## Data flow

```
admin UI ──PUT /service_status──▶ service_status table (apps/api)
                                        │
landing loader ──GET /service_status (public, 60s cache, LKG fallback)──┐
                                        │                               │
                     deriveVisibilityOverlay ─▶ registry gate fns (overlay ?? frontmatter)
                     deriveFormDisabledSlugs ─▶ $.tsx availableForms / underMaintenance
```

## Testing

- `parseServiceStatuses` — happy path, malformed shape, unknown status, bad slug.
- `resolveServiceStatuses` — fresh/stale/refetch, fetch-fail-with-cache (LKG),
  cold-start (empty map), TTL cooldown stamp. Mirrors the `available-forms`
  tests.
- `deriveVisibilityOverlay` / `deriveFormDisabledSlugs` — each status value.
- registry gate functions with an overlay — `disabled` hides for public /
  unlocks for preview; `enabled` publishes a `draft`; `form_disabled` leaves
  visibility unchanged; no-row falls back to frontmatter; ancestor gating.

## Out of scope

- Any change to `/service_status` or `/services` on the API.
- The feature-flagging admin UI.
- Merging status into the `/services` response.
- The `seed-service-status-from-content` script.
