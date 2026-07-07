# Feature-flagging admin UI

GitHub-auth-gated admin tool to **view and change the visibility status of every
government service**, backed by the `service_status` API on `apps/api`. Built for
[#1898](https://github.com/govtech-bb/gov-bb/issues/1898) (design:
[`docs/superpowers/specs/2026-07-07-feature-flagging-admin-ui-design.md`](../../docs/superpowers/specs/2026-07-07-feature-flagging-admin-ui-design.md)).

## What it does

- Lists every service (landing content + forms registry, reconciled to one slug
  namespace) with its current status.
- Lets an authorized admin set each service's status —
  `enabled` / `form_disabled` / `disabled` — with an optimistic update
  (`PUT /service_status`, `author` = the signed-in GitHub login).
- Shows each service's change history from the audit log
  (`GET /service_status/audit`).
- Gates access behind GitHub org/team membership (or repo write access).

## Stack

TanStack Start + Nitro SSR + React + Vite, deployed to AWS Amplify — the same
shape as `apps/form_builder`, whose GitHub-OAuth session layer this reuses. The
admin bearer token is held server-side only (never bundled into the client).

## Local dev

```bash
pnpm --filter @govtech-bb/feature-flagging-app dev
```

With no `SESSION_SECRET` set, auth is bypassed (`login: "dev"`) and, with no
`SERVICE_STATUS_ADMIN_TOKEN`, the api's `AdminTokenGuard` passes through
(ADR-0061). By default the app reads the **sandbox** forms API
(`FEATURE_FLAGGING_API_URL`) so the list is populated without a local api. See
[`.env.example`](.env.example) for the full config.

## Service catalogue

The landing half of the catalogue is baked at build time (offline-safe) into
`app/lib/services-catalogue.generated.ts`. Regenerate when landing content
changes:

```bash
pnpm --filter @govtech-bb/feature-flagging-app generate:catalogue
```

The forms list and live statuses are fetched at request time and merged in
`app/lib/catalogue.ts`.

## Deployment / infra checklist

The code (this app + `amplify.yml` block) is in-repo. Making it reachable
requires one-time infra, done outside the codebase:

- [ ] Register a GitHub OAuth app; set callback to
      `${OAUTH_REDIRECT_BASE}/auth/github/callback`.
- [ ] Create the Amplify app + `sandbox`-tracked branch + DNS
      (e.g. `feature-flagging.<env>.alpha.gov.bb`).
- [ ] Set env + Secrets Manager entries per environment:
      `FEATURE_FLAGGING_API_URL`, `OAUTH_REDIRECT_BASE`, `GITHUB_ORG`,
      `GITHUB_TEAM_SLUG`, and the `FEATURE_FLAGGING_TOKENS_SECRET_ARN`
      (`{ admin_token, session_secret }`) +
      `FEATURE_FLAGGING_GITHUB_OAUTH_SECRET_ARN` (`{ client_id, client_secret }`).
- [ ] Set `SERVICE_STATUS_ADMIN_TOKEN` on the `apps/api` service (must match
      `admin_token`) so the guard enforces in prod — today it is unset (dev
      passthrough).
```
