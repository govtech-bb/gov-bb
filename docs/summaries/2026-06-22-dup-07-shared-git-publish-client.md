# DUP-07 — Shared GitHub recipe-publish client

## Context

`form_builder` and `form_builder_api` each opened recipe-publish PRs, but the
api surface (`POST /builder/publish`) reimplemented the whole GitHub-REST flow
inline — a byte-for-byte copy of form_builder's `github.ts` helpers — and
**hardcoded** the repo identity (`govtech-bb` / `gov-bb` / `dev`) where
form_builder resolves it from env. The hardcoded values had silently diverged
from the env-driven ones. Tracked as
[#1400](https://github.com/govtech-bb/gov-bb/issues/1400) (DUP-07).

## What we did

- New buildable package **`@govtech-bb/git-publish`** (mirrors the `registry`
  package layout) holding the REST primitives, parameterised on
  `{ owner, repo }` via `createPublishClient`.
- `form_builder/app/server/github.ts` → thin wrapper that binds the app's
  `repoOwner()`/`REPO_NAME` identity and delegates to the package, preserving
  every existing export and signature (so `publish.ts` / `content/-server.ts`
  are untouched).
- `form_builder_api/src/routes/publish.ts` → consumes the package; deleted the
  inline helpers and the hardcoded constants. Owner now from `GITHUB_ORG`
  (throws if unset), base from `PUBLISH_BASE_BRANCH ?? "dev"`.
- See [ADR 0054](../decisions/0054-recipe-publish-github-flow-is-shared-and-env-identified.md)
  for the standing principle.

## Why we did it that way

- **Package, not a fold into `@govtech-bb/content`.** Publishing is its own
  concern; a dedicated package keeps the dep graph honest (the rejected
  alternative would have mixed GitHub plumbing into a content-typed package).
- **Thin wrapper over a rewrite of the callers.** form_builder's `github.ts`
  already had clean primitives consumed by three call sites (Deploy, Erase,
  content pages) plus raw `fetch(repoUrl(...))` calls in the Erase flow's
  git-data operations. Keeping `github.ts`'s public surface identical — same
  function names, same `deleteBranch(branch, token)` arg order, same lazy
  `repoOwner()` resolution (throws at *use*, not import) — meant zero churn in
  the callers and made the change a provable lift-and-shim.
- **Identity injected by the caller, not resolved in the package.** Each app
  keeps its own env-driven source of truth (`GITHUB_ORG` throws-on-unset). We
  deliberately chose throw-on-unset over a `?? "govtech-bb"` fallback: a missing
  env var should fail loudly, not silently publish to a guessed org — that
  fallback is precisely the class of bug #1400 was.
- **Base-branch resolution stays in each app, not the package.** form_builder's
  `resolveBaseBranch()` has a Vite-baked `PUBLISH_BASE_BRANCH_DEFAULT` tier for
  Amplify Compute (whose SSR Lambda gets no runtime env); the api is plain
  node/ECS and reads `PUBLISH_BASE_BRANCH ?? "dev"` directly. The package takes
  `baseBranch` as a parameter rather than absorbing runtime-specific logic.
- **`#935` sanitisation kept at the call sites.** The per-segment
  `encodeURIComponent` of the contents path and the cleanup-branch path stays in
  `publish.ts` (the `fetch` sink moved into the package, but the sanitiser runs
  before the value crosses the boundary, so the CodeQL request-forgery query
  still clears).

## Open questions

- **Deploy env gate (pre-merge):** `GITHUB_ORG` is now load-bearing for
  `form_builder_api`, but its value lives in the AWS-side `form-builder-sandbox`
  ECS task definition, which couldn't be read this session (expired SSO token).
  Confirm it's set before merge, or publishing throws.
- **Two entry points remain** (deliberately out of scope). Converging
  form_builder and form_builder_api onto one owner of publishing is a separate
  follow-up.
- The two flows still write recipes to **different paths**
  (`recipes/<id>/<v>.json` in the api vs
  `apps/api/src/forms/form-definitions/recipes/<id>/<v>.json` in form_builder) —
  caller-owned flow semantics, untouched here, but worth a look in the
  convergence follow-up.
