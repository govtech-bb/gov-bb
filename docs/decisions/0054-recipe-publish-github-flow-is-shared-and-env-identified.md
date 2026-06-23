# 0054 — Recipe-publish GitHub flow is shared and env-identified

**Date:** 2026-06-22
**Status:** Accepted

## Context

Two surfaces open recipe-publish PRs against the repo:

- **`form_builder`** — the Deploy/Erase server fns
  (`apps/form_builder/app/server/publish.ts`), built on clean reusable
  primitives in `app/server/github.ts`. Repo identity is **env-driven**: the
  owner comes from `GITHUB_ORG` (via `repoOwner()`, which throws if unset — see
  [#700](https://github.com/govtech-bb/gov-bb/issues/700)) and the base branch
  from `PUBLISH_BASE_BRANCH`.
- **`form_builder_api`** — `POST /builder/publish`
  (`apps/form_builder_api/src/routes/publish.ts`), the server/AI publish
  backstop.

The api surface **reimplemented the entire GitHub-REST flow inline** — byte-identical
`repoUrl`/`authHeaders` helpers plus branch-create / file-write / open-PR /
cleanup-delete — and **hardcoded** the repo identity as `govtech-bb` / `gov-bb`
/ `dev`. Two copies of the same plumbing drift; worse, a hardcoded org/repo/base
silently diverges from the env-driven values the rest of the platform resolves,
so a deploy could open a PR against the wrong org or branch with no code change
signalling it. This is exactly what
[#1400](https://github.com/govtech-bb/gov-bb/issues/1400) (DUP-07) found.

## Decision

**There is one GitHub-REST recipe-publish client, and repo identity is always
resolved from env — never reimplemented inline, never hardcoded.**

- The primitives live in **`@govtech-bb/git-publish`**
  (`createPublishClient({ owner, repo })` → `createBranchFrom` / `putFile` /
  `openPullRequest` / `deleteBranch` / `getContents` / `listOpenPRHeads`, plus
  `authHeaders` / `ghError`). Both surfaces consume it: `form_builder`'s
  `github.ts` is a thin wrapper binding the app's `repoOwner()`/`REPO_NAME`
  identity; `form_builder_api`'s `publish.ts` binds its own.
- **Repo identity comes from env on both surfaces.** Owner is `GITHUB_ORG`
  (throws if unset — fail loud, never fall back to a guessed org); the repo name
  is the fixed constant `gov-bb`; the base branch is `PUBLISH_BASE_BRANCH`
  (default `dev`).
- **Flow semantics stay with the callers.** Branch naming, PR copy, validation
  gates, and per-sink path/branch sanitisation
  ([#935](https://github.com/govtech-bb/gov-bb/issues/935)) are the caller's
  concern; the package only provides identity-bound REST primitives.

Merging the two entry points into one is explicitly **out of scope** — both
remain, but they can no longer drift on plumbing or identity.

## Consequences

- **New publish-style flows extend the shared client.** Any future GitHub
  PR-based recipe flow (a third surface, a new operation) adds to
  `@govtech-bb/git-publish` rather than copying `fetch`/auth/error code, and
  resolves identity from env. Reintroducing inline plumbing or a hardcoded
  org/repo/branch is a regression this ADR exists to catch in review.
- **`GITHUB_ORG` is load-bearing for `form_builder_api`.** It previously had no
  env dependency for repo identity; now an unset `GITHUB_ORG` makes publishing
  throw rather than silently target `govtech-bb`. The deploy environment (the
  `form-builder-sandbox` ECS task definition) **must** provide it.
- **Minor endpoint behaviour change.** GitHub base-ref-read / branch-create /
  open-PR failures on `POST /builder/publish` now surface as `500` (with the
  GitHub response body in the error message, via `ghError`) instead of the
  previous bare `502` — bringing the api surface in line with how `form_builder`
  already reports GitHub errors. No client branches on the `502`.
