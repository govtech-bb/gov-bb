# Feature-flagging Admin UI — Design

**Date:** 2026-07-07
**Status:** Approved
**Issue:** [#1898](https://github.com/govtech-bb/gov-bb/issues/1898) (sub-task of #1650)
**Branch base:** `main` (trunk); PRs target `main`

## Context

The `service_status` API (#1886) is live on `apps/api`:

- `GET /service_status` — unauthenticated; returns `{ slug, status }` for every
  **row that exists** (services with no row default to `enabled`).
- `PUT /service_status` — `AdminTokenGuard` (`Authorization: Bearer
  <SERVICE_STATUS_ADMIN_TOKEN>`, ADR-0061 dev-bypass); body `{ slug, status,
  author }`.
- Tables `service_status` (one row per `slug`) and `service_status_audit_log`
  (append-only: `old_state`, `new_state`, `author`, `changed_at`).
- `status` is a **three-value enum**, not a boolean:
  `enabled` (page + form live) / `form_disabled` (page visible, form
  unreachable) / `disabled` (whole service hidden, preview-only).

No consumer reads `GET /service_status` yet, and there is **no read endpoint for
the audit log**. This design builds the GitHub-auth-gated admin tool that lists
every service, shows and mutates its status, and surfaces the audit trail.

## Decisions (locked)

- **App:** new `apps/feature_flagging` (named for the feature, not the API, to
  avoid colliding with the `service_status` tables/endpoints).
- **Catalogue:** union of forms registry + landing content, reconciled to one
  slug namespace.
- **Canonical slug:** `formId` when the service has a form; otherwise the
  landing content slug. This pins `service_status.slug` for all future
  consumers — a form-backed service is keyed by its `formId` (so both landing,
  via its `form_id` frontmatter, and forms, via `formId`, can look it up), and
  an info-only service is keyed by its landing content slug.
- **Audit trail:** add a read endpoint to `apps/api` now (not deferred).
- **Auth:** GitHub OAuth + org/team-membership gate, copied from `form_builder`.
- **Delivery:** **two PRs** —
  - **PR 1** (this first): `apps/api` audit-read endpoint. Small, independently
    useful, lower risk.
  - **PR 2**: the `apps/feature_flagging` app.

## Known adjacent system (out of scope)

`form_builder` has its own "disable form" mechanism (`form_builder_api` marks a
`formId` disabled → public fetch returns 410). That is a **separate** system
from `service_status` and is **not** reconciled here. This tool operates only on
`service_status`.

---

## PR 1 — `apps/api` audit-read endpoint

### Endpoint

`GET /service_status/audit?slug=<slug>`

- Guarded by the **same** `new AdminTokenGuard("SERVICE_STATUS_ADMIN_TOKEN",
  "ARCHIVE_DRAFTS_TOKEN")` used by `PUT` — author identities/emails stay out of
  public reach. `@ApiBearerAuth()`.
- Query DTO: `slug` — `@IsString @IsNotEmpty @MaxLength(100)`.
- Returns audit rows for that slug, **newest first**, as
  `ApiResponse.success(items, { message: "Service status audit retrieved" })`
  where each item is `{ slug, oldState, newState, author, changedAt }`
  (camelCase wire fields, matching the existing DTOs; `oldState` is `null` for a
  service's first-ever entry).
- Throttled like the sibling `GET` (throttle-short).

### Code

- `service-status-audit-log.repository.ts`: add `findBySlug(slug): Promise<AuditRow[]>`
  ordered by `changed_at DESC`.
- `service-status.service.ts`: add `getAuditForSlug(slug)` delegating to the repo.
- `service-status.controller.ts`: add the guarded `@Get("audit")` route +
  response mapping.

### Tests

- Controller: guard rejects missing/invalid token (401); happy path returns
  mapped rows newest-first for a slug; empty array for an unknown slug.
- Service/repository: `findBySlug` ordering + field mapping.
- Run `pnpm exec nx run api:test` (swc transform stays — NestJS DI metadata).

---

## PR 2 — `apps/feature_flagging` app

### Stack & layout

TanStack Start + Nitro SSR + React + Vite, deployed to Amplify — same stack as
`form_builder`. Uses `@govtech-bb/design` + `@govtech-bb/react` for UI
(form_builder does not, but the newer standalone apps do). Must be a buildable
nx project referenced correctly per the monorepo build rules in CLAUDE.md.

### Auth (copied from `form_builder`)

- `app/server/session-cipher.server.ts` — encrypted `ff_session` cookie, 8h TTL.
- `app/server/auth/require-session.ts` — server-fn middleware; dev tolerance
  (`login: "dev"`) when `SESSION_SECRET` unset.
- Routes `auth/github`, `auth/github/callback` (CSRF state + org/team check),
  `auth/denied`.
- Config: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `GITHUB_ORG`,
  `GITHUB_TEAM_SLUG`, `SESSION_SECRET`, `OAUTH_REDIRECT_BASE`.
- All routes are gated: unauthenticated users are redirected to the OAuth flow;
  non-members land on `auth/denied`. **AC: unauthorized users cannot access the
  tool or mutate status.**

### Server-side API client

A small dedicated client (NOT form_builder's `X-Admin-Token` `api-client.ts` —
different API, different scheme). Calls the NestJS forms API with
`Authorization: Bearer <SERVICE_STATUS_ADMIN_TOKEN>`.

- Token via `getServiceStatusAdminToken()` mirroring `secrets.ts`: Secrets
  Manager ARN in prod, `process.env.SERVICE_STATUS_ADMIN_TOKEN` fallback for
  dev. **The token is never bundled client-side.**
- Base URL from env (the forms API URL — e.g. `FEATURE_FLAGGING_API_URL`,
  defaulting to the sandbox forms API for local dev).
- All mutations are `createServerFn({ method: "POST" }).middleware([requireSession])`.
- `author` on every `PUT` = `context.session.login` (the GitHub login).

### Service catalogue (union, reconciled)

**Build-time (offline-safe, mirrors `scripts/generate-form-categories.ts`):**
generate `services-catalogue.generated.json` from landing content via
`@govtech-bb/content` `loadContent()` — `{ contentSlug, url, title, category,
formId (from frontmatter form_id), contentVisibility }` for each non-sub-page.
No network at build (keeps the build offline-safe, unlike landing's prebuild).

**Runtime (app server loader) reconciles three sources:**

1. baked landing catalogue (above),
2. `GET /form-definitions` (live forms list — includes any form with no landing
   page, plus titles),
3. `GET /service_status` (live DB statuses).

Into rows:

```
{
  slug: string          // canonical: formId if hasForm else contentSlug
  title: string
  category?: string
  hasForm: boolean
  landingUrl?: string
  contentVisibility?: "public" | "preview" | "draft"
  status: ServiceStatus // from GET /service_status, else "enabled"
}
```

Reconciliation rule: a landing service with a `form_id` merges with the matching
form (canonical slug = `formId`); a form with no landing page becomes its own
row (slug = `formId`, `hasForm: true`, no landing metadata); an info-only
landing service becomes a row (slug = `contentSlug`, `hasForm: false`).

### UI

- Searchable/filterable table of **every** service: title, category, canonical
  slug, has-form badge, content-visibility badge, and current status.
- Status control is **three-state** (`enabled` / `form_disabled` / `disabled`)
  — a select or segmented control, not a boolean toggle, since that is what the
  API models. `form_disabled` is shown but only meaningful for `hasForm`
  services (disabled/greyed for info-only rows).
- Changing status → **optimistic** update → server fn → `PUT /service_status` →
  confirm; **roll back on error** and surface the message.
- Per-row **history drawer**: server fn → `GET /service_status/audit?slug=` →
  timeline of `old → new`, author, and `changedAt`.
- **AC: authorized admins list all services with current visibility; toggling
  persists via `PUT` and appears in the audit log.**

### Deployment (code) & manual infra

**In this PR (code):**

- `amplify.yml` block for `feature_flagging` (copy form_builder's), CSP allowing
  `https://github.com` + `https://api.github.com`.
- nx `project.json` build/test targets; app added to the deploy workflow's
  affected-app matrix if it is an explicit list.
- `.env.example` documenting every variable.

**Out-of-code infra (PR checklist — cannot be done from code):**

- Register a GitHub OAuth app (client id/secret) for the tool's domain.
- Create the Amplify app + `sandbox`-tracked branch + DNS
  (`feature-flagging.<env>.alpha.gov.bb` or similar).
- Set env vars + Secrets Manager entries (`SERVICE_STATUS_ADMIN_TOKEN`,
  session/OAuth secrets) per environment.
- Set `SERVICE_STATUS_ADMIN_TOKEN` on the `apps/api` service so the guard
  actually enforces in prod (today it is unset → dev passthrough).
- **AC: deployed and reachable by admins** is completed by these steps.

### Tests

- **app**: reconciliation logic unit tests (merge rules, canonical-slug
  selection, formless + info-only edges); server-fn `author`-wiring test
  (author = session login); optimistic-update + rollback component test;
  require-session gate test.

---

## Success criteria (maps to issue AC)

- [ ] Authorized (GitHub-gated) admins list all services with current
      visibility. → catalogue loader + gated routes.
- [ ] Toggling persists via `PUT /service_status` and appears in the audit log.
      → status control server fn + audit drawer.
- [ ] Unauthorized users cannot access the tool or mutate status. → OAuth gate +
      `requireSession` on every server fn.
- [ ] Deployed and reachable by admins. → amplify.yml + manual infra checklist.
