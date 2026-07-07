# Runtime Content/Services Index on apps/api — Design

**Date:** 2026-07-07
**Status:** Approved
**Follows:** #1898 / #1650 (feature-flagging UI). Documented as a follow-up in
[#1650 comment](https://github.com/govtech-bb/gov-bb/issues/1650#issuecomment-4907049901).
**Branch base:** `main`; PR targets `main`.

## Problem

The feature-flagging UI (`apps/feature_flagging`, #1898) bakes the landing
content list at build time into `app/lib/services-catalogue.generated.ts`. A new
landing page therefore doesn't appear in the tool until that app is regenerated
and redeployed — and a content-only change doesn't mark `feature_flagging`
nx-affected, so its snapshot goes stale.

Move the content/services index behind an `apps/api` endpoint the tool fetches at
runtime.

## Decisive constraint

The deployed `apps/api` Docker image ships only compiled `dist/` — **not** the
landing `.md` files (`apps/landing/src/content`). So `loadContent()` (which reads
those files) **cannot run at api runtime**. The repo's proven pattern for
"content data available to the api without the files" is a **build-time
generated constant** compiled into the image — exactly how
`packages/content/src/form-categories.generated.ts` already ships and is
consumed with zero runtime I/O.

True zero-deploy live is not achievable (content lives in git; it changes only
via merge/deploy). This design ties the index's freshness to the **api's**
deploy — which the content PR already triggers — instead of `feature_flagging`'s
independent cadence.

## Decisions (locked)

- **Generated index** in `@govtech-bb/content` (mirrors `form-categories`).
- **Endpoint:** `GET /services` on `apps/api`. **Public**, but returns
  `visibility:public` only unless a valid admin bearer token is presented, in
  which case it returns **all** visibilities (mirrors `/form-definitions`'
  public-vs-tokened split). Soft auth — never throws for the public case.
- **Single source of truth:** `feature_flagging` fetches `GET /services` and
  **deletes** its baked snapshot + generator. On fetch failure it degrades
  gracefully (forms + statuses only, error surfaced) — no baked fallback.

---

## Components

### 1. `@govtech-bb/content` — generated services index

- `build-services-index.ts` — pure `buildServicesIndex(services: ServiceEntity[])
  → ServiceIndexEntry[]`, where
  `ServiceIndexEntry = { slug, title, category?, formId?, visibility }`
  (`slug` = content slug; `category` = `category ?? categories?.[0]`; `formId`
  from frontmatter `form_id`; `visibility` defaults `public`). Exported type.
- `services-index.generated.ts` — committed constant `SERVICES_INDEX:
  ServiceIndexEntry[]`, produced by `scripts/generate-services-index.ts`
  (`loadContent()` → `buildServicesIndex` → write file), wired as
  `pnpm generate:services-index`. Mirrors `scripts/generate-form-categories.ts`.
- Exported from the package index alongside `FORM_CATEGORIES`.

### 2. `apps/api` — `GET /services`

- New `ContentModule` / `ServicesController` / `ServicesService`, registered in
  `app.module.ts`. Throttled like the sibling read controllers.
- `apps/api` gains a dependency on `@govtech-bb/content` (compiled import of the
  generated constant — **no `.md` files needed**). Wire per the monorepo build
  gotcha (add to `apps/api/package.json` + `tsconfig.json` `references`) and
  confirm the Docker image ships `dist/packages/content` + the content manifest
  (the #1880 groundwork). **This is the primary implementation risk.**
- Soft auth via the existing `resolveTokenAuth` + a bearer parser (not the
  throwing `AdminTokenGuard`): read `Authorization: Bearer`, resolve against
  `SERVICE_STATUS_ADMIN_TOKEN` then `ARCHIVE_DRAFTS_TOKEN`;
  `includeNonPublic = decision === "ok" || decision === "passthrough"` (dev
  no-token passthrough → sees all). Otherwise return `visibility:public` only.
- Response: `ApiResponse.success(items)` where each item is a
  `ServiceIndexEntry`.

### 3. `apps/feature_flagging` — fetch at runtime

- `app/server/service-status.ts` `listServices`: fetch `GET /services` (via the
  existing bearer api-client, so it gets all visibilities in prod), map to the
  `LandingService` shape (`slug→contentSlug`, `visibility→contentVisibility`),
  and pass to the unchanged `reconcileCatalogue`.
- **Delete** `app/lib/services-catalogue.generated.ts`,
  `scripts/generate-services-catalogue.ts`, the `generate:catalogue` script, and
  the `@govtech-bb/content` devDependency.
- On `GET /services` failure: log + return `[]` landing, so the tool still
  renders forms + statuses (reconcile handles empty landing). Surface nothing
  fatal — degrade, don't crash.

---

## Data flow

```
content .md ──(generate:services-index, build-time)──▶ SERVICES_INDEX (packages/content, committed)
                                                            │ compiled into api image
apps/api  GET /services ──(soft-auth: public vs all)────────┘
   ▲
   │ runtime fetch (bearer)
apps/feature_flagging listServices ──▶ reconcileCatalogue(landing, forms, statuses)
```

## Testing

- **packages/content**: unit-test `buildServicesIndex` (slug/title/category
  fallback, `form_id` → `formId`, visibility default).
- **apps/api**: controller/service tests — public request returns public-only;
  tokened request returns all; dev passthrough returns all. Boot-safety
  (module compiles) via the existing admin-guards-boot pattern if a guard were
  used (here soft-auth needs no guard instance).
- **feature_flagging**: `listServices` maps the `/services` payload to
  `LandingService` and reconciles; failure path yields forms+statuses only.
- Full `nx run-many -t build` (esp. `api` + `content`) and a Docker-deps sanity
  check that the api image resolves `@govtech-bb/content`.

## Rollout / ordering

- Independent of PRs #1908/#1909, but complements them. When merged, regenerate
  `services-index.generated.ts` in any future content PR (like form-categories).
- Optional follow-up: a CI check that the generated index is current (parallel
  to any existing form-categories freshness check).

## Success criteria

- [ ] `GET /services` returns the content index; public-only without a token,
      all visibilities with a valid admin token.
- [ ] `feature_flagging` lists content pages fetched at runtime; no baked
      snapshot remains.
- [ ] A content change reflected by regenerating the index → api redeploys
      (nx-affected via `@govtech-bb/content`) → tool shows it with no
      `feature_flagging` redeploy.
- [ ] `nx build` green including the api Docker content dependency.
