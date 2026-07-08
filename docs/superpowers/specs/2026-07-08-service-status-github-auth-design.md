# GitHub-identity auth for service_status admin endpoints — Design

**Date:** 2026-07-08
**Status:** Approved
**Follows:** #1650 / #1898 (feature-flagging). Replaces the shared-token auth
shipped in #1886 (`PUT`), #1908 (audit), #1911 (`/services`).
**Branch base:** `main`; PR targets `main`.

## Problem

The `service_status` admin surface authenticates with a **shared static token**
(`SERVICE_STATUS_ADMIN_TOKEN`, via `AdminTokenGuard` / soft-auth). Two
weaknesses:

- It's a shared secret to provision and rotate, and the feature-flagging app
  must carry it (Secrets Manager) even though users already sign in with GitHub.
- The API can't verify **who** made a change — `author` is passed in the request
  body, so anyone with the token can write any author. The audit trail is only
  as trustworthy as the token.

## Decision

Authenticate the mutating/admin routes by a **forwarded GitHub access token**
instead of the shared token. The feature-flagging app already obtains the user's
GitHub token at sign-in; it forwards it, and the API validates it against GitHub
and (in production) checks org/team membership. The verified GitHub login becomes
the audit author.

- **Local dev** (`NODE_ENV !== "production"`): any authenticated GitHub user is
  authorized (login still required — the token must be valid).
- **Production**: the user must be an active member of
  `${GITHUB_ORG}/${GITHUB_TEAM_SLUG}` or have write access to `gov-bb`.
- **`GET /service_status`** stays a public, unauthenticated read (landing/forms
  consume it). Only the audit read + `PUT` + the `/services` non-public view
  require identity.

## Components (apps/api)

- `common/github-identity.ts` — GitHub calls + the pure rule:
  - `fetchGitHubLogin(token)` → login or `null` (invalid).
  - `userIsTeamMember` / `userHasRepoWriteAccess`.
  - `isMemberAuthorized({isDev, isTeamMember, hasRepoWrite})` (pure, tested).
  - `authorizeGitHubToken(token)` → the authorized login, or `null`. Throws only
    on production misconfig (missing `GITHUB_ORG`/`GITHUB_TEAM_SLUG`) or an
    unexpected GitHub transport error.
- `common/guards/github-auth.guard.ts` — `GitHubAuthGuard`: reads
  `Authorization: Bearer <github token>`, 401 if missing/invalid, 403 if not
  authorized, and attaches the verified `githubLogin` to the request. Plain class
  guard (no constructor deps → no DI-paramtype boot pitfall).
- `common/github-login.decorator.ts` — `@GitHubLogin()` injects the verified
  login into the handler.

## Endpoint changes

- **`PUT /service_status`**: `@UseGuards(GitHubAuthGuard)`; `author` comes from
  `@GitHubLogin()`, not the body. `author` is **removed** from
  `UpdateServiceStatusDto` (the global `ValidationPipe` is `forbidNonWhitelisted`,
  so callers must stop sending it — the app does).
- **`GET /service_status/audit`**: `AdminTokenGuard` → `GitHubAuthGuard`.
- **`GET /services`**: soft-auth `includeNonPublicFromAuth` now resolves the
  forwarded GitHub token (`authorizeGitHubToken`) instead of matching the admin
  token; still never throws (unauthenticated/unauthorized → public-only).

`SERVICE_STATUS_ADMIN_TOKEN` is no longer read by any of these paths.
`AdminTokenGuard` / `ARCHIVE_DRAFTS_TOKEN` remain for the other admin
controllers (draft-archive, form-disabled-overrides).

## App change (delivered on the #1909 branch)

`apps/feature_flagging` api-client forwards `session.accessToken` as
`Authorization: Bearer` on its API calls, and the `PUT` payload drops `author`.
The Secrets-Manager `admin_token` entry is no longer needed by the app.

## Config / deployment

Production `apps/api` must have `GITHUB_ORG` and `GITHUB_TEAM_SLUG` set (read
per-request, never boot-required — a missing value fails the specific request,
not boot). No new secret. Removes the need to keep `SERVICE_STATUS_ADMIN_TOKEN`
in sync between the api and the app.

## Trade-offs

- One GitHub API round-trip per write / audit read / tokened `/services` read
  (writes are rare; cacheable later if needed). Public `/services` reads make no
  GitHub call.
- `apps/api` now handles user GitHub tokens in memory for the duration of a
  request (never stored). Accepted: it removes the shared static secret and gives
  a real, unspoofable audit author.

## Testing

- `github-identity`: `isMemberAuthorized` (dev/prod) + `authorizeGitHubToken`
  (invalid, dev, prod-member, prod-non-member) with mocked fetch.
- `service_status` controller: `PUT` uses the guard-verified login as author.
- `content` controller: `includeNonPublicFromAuth` (no token / authorized /
  unauthorized / throws-safe).
- `admin-guards-boot`: the real controller still boots with `GitHubAuthGuard`.

## Success criteria

- [ ] `PUT`/audit require a valid, authorized GitHub token; author is the
      verified login.
- [ ] `GET /services` returns all visibilities only for an authorized GitHub
      token; public-only otherwise; `GET /service_status` stays public.
- [ ] `SERVICE_STATUS_ADMIN_TOKEN` removed from the service_status/content paths
      and from the app.
- [ ] Local dev: any signed-in GitHub user can toggle against a local API with
      no token configured.
