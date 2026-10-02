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

## Auth

GitHub sign-in is **required in every environment** — there is no dev bypass.
Authorization differs by environment:

- **Local dev** (`vite dev`): any authenticated GitHub user is allowed (login
  required, but no org/team check).
- **Deployed** (Amplify, any production build): the user must be an active member
  of `${GITHUB_ORG}/${GITHUB_TEAM_SLUG}` **or** have write access to the repo —
  otherwise they land on `/auth/denied`. Same gate as `form_builder`.

The environment is distinguished by `import.meta.env.DEV` (true under `vite dev`,
false in any built output including Amplify).

## Local dev

Because login is required, local dev needs a GitHub OAuth app + a session
secret. The dev server runs on a **fixed port 3005** (`vite.config.ts`), so
register the OAuth app's **Authorization callback URL** as
`http://localhost:3005/auth/github/callback`, then put these in `.env` (see
[`.env.example`](.env.example)):

```bash
SESSION_SECRET=$(openssl rand -base64 32)
GITHUB_OAUTH_CLIENT_ID=<client id>
GITHUB_OAUTH_CLIENT_SECRET=<client secret>
OAUTH_REDIRECT_BASE=http://localhost:3005
```

`GITHUB_ORG` / `GITHUB_TEAM_SLUG` are **not** needed locally (dev skips the
membership check), and `LANDING_URL` / `FORMS_URL` are not needed either — unset,
the table's service links fall back to the docker-stack origins (see
[Where a service title links to](#where-a-service-title-links-to)). Then:

```bash
pnpm dev:feature_flagging_ui   # serves http://localhost:3005
```

Open http://localhost:3005 → the login page → **Sign in with GitHub**; after
sign-in you're in as your GitHub login. The app reads the **sandbox** forms API
by default (`FEATURE_FLAGGING_API_URL`). The API authenticates its admin routes
by your forwarded GitHub token — locally any authenticated GitHub user is
authorized, so no admin token is needed. (Toggling against sandbox requires the
GitHub-auth API change to be deployed there — see the `apps/api` PR.)

## Service catalogue

All three sources are fetched from `apps/api` at request time and merged in
`app/lib/catalogue.ts`:

- content pages — `GET /services` (the runtime content index),
- forms — `GET /form-definitions`,
- live statuses — `GET /service_status`.

No catalogue data is baked at build time, so new landing pages appear once the
api serves them (the api regenerates its `services-index.generated.ts` and
redeploys) — no redeploy of this app needed. If `GET /services` is unavailable
the tool degrades to forms + statuses.

### Where a service title links to

Each row's title links to the service's public page — its landing content page,
or the form itself for a form-only service (`app/lib/service-url.ts`). The two
base origins for those links, **`LANDING_URL`** and **`FORMS_URL`**, are the one
thing here that _is_ fixed at build time: Amplify Hosting Compute doesn't pass
branch env vars to the SSR Lambda at runtime, so `vite.config.ts` bakes them
into the bundle via `define`. Changing either one on an Amplify branch therefore
needs a **redeploy** of that branch before the links change.

**Don't hardcode the values here** — read them off the environment being
deployed, so a domain change doesn't leave this file lying:

- **landing** and **forms** origins for an environment are whatever that
  environment's deploy workflow smoke-tests: `AMPLIFY_LANDING_URL` /
  `AMPLIFY_FORMS_URL` at the top of `deploy-staging.yml` and `deploy-prod.yml`,
  or the per-app `APP_URL` of the landing and forms smoke steps in
  `deploy-sandbox.yml`. Using those keeps a link pointing at the same site QA is
  looking at, and they move when DNS moves.
- Don't assume the naming is uniform across environments, or that every
  environment has a custom domain yet — check the workflow rather than
  extrapolating from another environment's hostname.
- **local dev** needs nothing: unset falls back to the docker-stack origins that
  `app/lib/service-url.ts` defaults to.

Those defaults are right for a local run and useless anywhere else, so a
**deployed** build (one where Amplify's `AWS_APP_ID` is present) with either var
missing **fails the build** instead of shipping links to the reader's own
machine, which is how they went unnoticed on sandbox in
[#2167](https://github.com/govtech-bb/gov-bb/issues/2167). That guard is
`build-env.ts`, called from `vite.config.ts` and covered by `build-env.spec.ts`
— the spec fails if it's ever weakened back to a silent fallback.

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
      (`{ session_secret }`) +
      `FEATURE_FLAGGING_GITHUB_OAUTH_SECRET_ARN` (`{ client_id, client_secret }`).
- [ ] Set `LANDING_URL` + `FORMS_URL` on **every** tracked branch (sandbox,
      staging, prod) — where to read the values per environment is in
      [Where a service title links to](#where-a-service-title-links-to). The
      build **fails** without them, so a branch that misses them can't deploy.
- [ ] Ensure `apps/api` has `GITHUB_ORG` + `GITHUB_TEAM_SLUG` set so it can
      authorize the forwarded GitHub tokens in prod (no shared admin token
      needed — see the `apps/api` GitHub-auth change).
```
