# 0011 — Form Builder access is delegated to GitHub identity

**Date:** 2026-05-27
**Status:** Accepted
**Related:** Plan `apps/form_builder/docs/plans/github-team-scoped-auth.md`; session summary [2026-05-27-github-team-scoped-auth](../summaries/2026-05-27-github-team-scoped-auth.md).

## Context

Form Builder login wraps the `/builder` routes behind a GitHub OAuth handshake.
The original gate was a single check — write/admin on `govtech-bb/gov-bb`
(`userHasRepoWriteAccess`). Granting a new author access therefore meant adding
them as a repo collaborator, conflating "can author forms" with "can write to
the codebase". We wanted to widen access to a GitHub team without coupling it to
repo permissions, and without maintaining a list of logins in source.

## Decision

Form Builder authorization is delegated to **GitHub identity**, never a
hardcoded user allowlist in code. A user is allowed when **either**:

1. they are an **active** member of a configured GitHub team
   (`userIsTeamMember`, `state === "active"`), or
2. they have **write/admin** on the repo (`userHasRepoWriteAccess`).

The team is identified by env vars — `GITHUB_ORG` (the org that owns both the
repo and the team) and `GITHUB_TEAM_SLUG` (the canonical team slug, the URL
segment, supplied directly rather than slugified in code). `GITHUB_ORG` is the
single source for the repo owner everywhere it was previously hardcoded
(`github-oauth.ts`, `publish.ts`, `github-recipes.ts`); the repo *name* stays
hardcoded.

## Consequences

- **Manage access in GitHub, not source.** Adding or removing authors is a
  GitHub team-membership change (or repo-collaborator change), never a code
  edit. Future access changes must not introduce hardcoded login lists.
- **OR, checked team-first.** The repo-write path is retained so existing
  collaborators stay unblocked through and after cutover. New gating logic must
  preserve the OR — do not replace one arm with the other.
- **`read:org` scope is load-bearing.** Reading team membership needs the
  `read:org` OAuth scope; without it the membership call 403s and members are
  wrongly denied. The `repo` scope must also stay (the token commits recipes /
  opens PRs in `publish.ts`).
- **Env-configured, fail-fast.** The callback and the `repoOwner()` accessors
  throw when `GITHUB_ORG` / `GITHUB_TEAM_SLUG` are unset. Deployments (Amplify)
  must set both, or login throws. An empty `GITHUB_TEAM_SLUG` does not "disable
  the gate" — it makes the login round-trip throw.
- **Membership is checked at login only.** Removing someone from the team takes
  effect on their next login or when the session TTL expires, not instantly.
