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

## Decisive constraints

1. The deployed `apps/api` Docker image ships only compiled `dist/` — **not** the
   landing `.md` files (`apps/landing/src/content`). So `loadContent()` (which
   reads those files) **cannot run at api runtime**. The fix is a **build-time
   generated constant** compiled into the image.
2. `@govtech-bb/content` is the **only** workspace package that exposes its API
   through an `exports` map pointing at **`.ts` source** (so its tsx-script
   consumers — `generate-form-categories`, chat ingest, analytics snapshot —
   resolve it from source). Every package the api consumes at runtime instead
   uses a compiled `main: ./src/index.js`. Making the api import
   `@govtech-bb/content` at runtime would need node to load `.ts` (impossible)
   or a package-json change that breaks those tsx consumers — and re-opens the
   #1880 pruned-deps pain. **Therefore the api must NOT take a runtime
   dependency on `@govtech-bb/content`.**

Consequence: the generated index is **owned by `apps/api`** (generated into its
own source tree, compiled into its own `dist`). `@govtech-bb/content` keeps only
the pure `buildServicesIndex` helper, used by the generator at build time (via
tsx, from source). No api→content runtime dependency, no Docker/tsconfig-
reference changes.

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

### 1. `@govtech-bb/content` — pure helper only

- `build-services-index.ts` — pure `buildServicesIndex(services) →
  ServiceIndexEntry[]`, where
  `ServiceIndexEntry = { slug, title, category?, formId?, visibility }`
  (`slug` = content slug; `category` = `categories?.[0] ?? category`; `formId`
  from frontmatter `form_id`; `visibility` defaults `public`). Exported for the
  generator. No generated constant lives in this package.

### 2. Generator → `apps/api`-owned generated file

- `scripts/generate-services-index.ts` (root, tsx) — `loadContent()` →
  `buildServicesIndex` → writes
  `apps/api/src/content/services-index.generated.ts` (a `SERVICES_INDEX`
  constant typed by an **api-local** `ServiceIndexEntry`). Wired as
  `pnpm generate:services-index`. Mirrors `scripts/generate-form-categories.ts`,
  but the output lives in the api so the api needs no content runtime dep.

### 3. `apps/api` — `GET /services`

- New `ContentModule` / `ContentController` / `ContentService` under
  `apps/api/src/content/`, registered in `app.module.ts`. Throttled like the
  sibling read controllers. Owns `service-index.type.ts` (`ServiceIndexEntry`)
  and imports the generated `SERVICES_INDEX` locally — **no `@govtech-bb/content`
  import**.
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
content .md ─(generate:services-index, tsx build-time)─▶ SERVICES_INDEX (apps/api/src/content, committed)
                                                             │ compiled into api's own dist
apps/api  GET /services ──(soft-auth: public vs all)─────────┘
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

## Delivery / ordering

`apps/feature_flagging` is not on `main` yet (PR #1909, unmerged), so the work
splits across two branches:

- **This PR → `main`:** the api `GET /services` endpoint, the root generator +
  `pnpm generate:services-index`, the api-owned generated file, and the pure
  `buildServicesIndex` in `@govtech-bb/content`. Self-contained and mergeable
  independently.
- **On the PR #1909 branch:** component 4 (feature_flagging fetches `/services`,
  deletes its baked snapshot + generator + content devDependency). Lands there
  because that's where the app lives.

When a future content PR changes landing pages, regenerate
`services-index.generated.ts` (like form-categories). Optional follow-up: a CI
check that the generated index is current.

## Success criteria

- [ ] `GET /services` returns the content index; public-only without a token,
      all visibilities with a valid admin token.
- [ ] `feature_flagging` lists content pages fetched at runtime; no baked
      snapshot remains.
- [ ] A content change reflected by regenerating the index → api redeploys
      (nx-affected via `@govtech-bb/content`) → tool shows it with no
      `feature_flagging` redeploy.
- [ ] `nx build` green including the api Docker content dependency.
