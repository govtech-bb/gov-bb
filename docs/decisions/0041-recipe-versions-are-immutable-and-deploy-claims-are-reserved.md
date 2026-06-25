# 0041 — Recipe versions are immutable, and a deploy claims its version before touching GitHub

**Date:** 2026-06-05
**Status:** Superseded by [0057](0057-recipe-versioning-removed-one-flat-file-per-form.md) (#1196)

> **Superseded (2026-06-23, #1196).** Recipe versioning was removed, so the
> premises here invert: recipes are no longer immutable versioned artifacts but a
> single mutable file `recipes/{formId}.json` edited in place and reviewed by
> diff. The `recipe-version-guard` CI gate, the `recipe-version-override` label,
> the DB deploy-claim reservation, and the `UNIQUE(form_id, version)` constraint
> are all removed. Cross-PR version collisions cannot occur because there are no
> versions to collide.

## Context

Issue [#873](https://github.com/govtech-bb/gov-bb/issues/873): two deploy PRs
(or a manual recipe PR plus a builder deploy) could claim the same recipe
version. The builder computed its deploy version from the DB draft alone —
blind to manual repo bumps and other users' in-flight deploys — and nothing
stopped a PR from rewriting an already-shipped `recipes/<id>/<semver>.json`
in place. Whichever PR merged second silently buried the other author's
changes under the same version number.

## Decision

Two principles, enforced by three independent layers (CI guard, server-side
version resolution, DB reservation):

1. **A recipe version that exists on the base branch is immutable.** A changed
   recipe ships as a *new* version — never an in-place edit of
   `recipes/<id>/<semver>.json`. CI (`recipe-version-guard`) fails any PR that
   modifies or renames an existing version. Escape hatch: the
   `recipe-version-override` label, for deliberate edits only (labels are read
   live, so add-label + re-run works). Deletions are always exempt — they are
   the erase/revert flows.

2. **A deploy claims `(formId, version)` atomically before doing anything
   irreversible.** `publishRecipe` reserves the version in the builder DB
   (reusing `POST /builder/forms`; the `UNIQUE(form_id, version)` constraint
   is the arbiter, surfaced as 409) before creating any branch or PR, and
   releases the claim on every post-reservation failure. The claim row doubles
   as the visible pending-deploy draft, so other users' version pickers bump
   past it; the post-merge `archive-merged-drafts` workflow retires it.

3. **On cross-PR version collisions, the older PR wins.** The newer PR's CI
   fails with a pointer to the older claim; symmetric failure would deadlock
   both. There is no override for collisions — two PRs for one version is
   never legitimate.

## Consequences

- Anything that writes a recipe version — builder deploys, manual PRs, future
  tooling — must mint a fresh version rather than editing a shipped file. The
  override label exists for the rare deliberate exception, and its use is
  visible on the PR.
- The deploy version offered to users is **server-resolved**
  (`getNextDeployVersion`: max of loaded version, base-branch files, open
  deploy-PR claims, then one minor bump). Client-side bumps are only a
  fallback display value; `publishRecipe` re-checks server-side either way.
- Reservation rows are expected, transient state: an open deploy PR implies a
  matching unpublished draft row at that version. Tooling that reconciles the
  DB against the repo must not treat them as orphans while the PR is open.
- The DB unique constraint — not any pre-check `findOne` — is the source of
  truth for concurrent claims; handlers must surface constraint violations
  (`23505`) as 409, not 500, so callers can give "claimed, reopen and retry"
  guidance.
