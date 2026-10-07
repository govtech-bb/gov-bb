# 0070 — A PR-based authoring flow reuses the artifact's open PR

**Date:** 2026-08-23
**Status:** Accepted

## Context

Several flows in this repo let a non-engineer author something and ship it as a
GitHub pull request: the builder's Deploy (a form recipe), the builder's Erase,
and the `/content` section (a landing markdown page). Each writes to a path
derived deterministically from the artifact's id — a recipe lands at
`apps/api/src/forms/form-definitions/recipes/<formId>.json`, a page at
`src/content/<slug>.md`.

Because the path is derived, two PRs for the same artifact are never
independent: they rewrite the same file. They conflict by construction. The
second to merge either hits a conflict or silently clobbers the first, and the
author gets no signal that they've just forked their own work.

The content flow recognised this early and reused the open PR
(`pushToExistingPR`). Builder Deploy did not. It minted
`form-builder/<formId>-<Date.now()>` on every call, so deploying a form twice —
the ordinary case, since a reviewer asks for a change and the author redeploys —
produced two competing PRs. The capability had in fact existed and was dropped:
`deployBranchPrefix` was introduced (#805) so the publish flow could recognise
open deploy PRs, its consumer `listOpenDeployClaims` was deleted in #1196 along
with recipe version reservation, and nothing replaced it. The exported helper
sat unused until #2390.

The matching rule is the subtle part. The obvious implementation — does the head
ref start with `deployBranchPrefix(formId)` — is wrong, and wrong in a way that
corrupts data rather than merely failing. `deployBranchPrefix("passport")` is
`form-builder/passport-`, which is also a string prefix of
`form-builder/passport-renewal-1712345678901`. Form `passport` would find form
`passport-renewal`'s open PR and push its recipe onto it, so a reviewer approving
one form's PR would merge a different form's contract.

## Decision

**A PR-based authoring flow opens at most one PR per artifact.** When a deploy
finds an open PR for the artifact it is publishing, it pushes onto that PR's
branch instead of opening a second one, and tells the author which of the two
happened.

**The artifact↔PR join is a strictly-parsed branch identity.** A flow that
encodes an artifact id in its branch name must provide a parser that recovers
the id from a head ref and returns "not mine" for anything else — never a
prefix, `includes`, or substring test. The parser must not take a candidate id
as input, so no candidate can influence the parse:
`formIdFromDeployBranch(headRef)` splits `form-builder/<id>-<digits>` on the
last dash and validates the recovered id, which makes the sibling collision
structurally impossible rather than merely tested against. Namespaces that
share a prefix (`form-builder/erase-…` vs `form-builder/…`) must be
disambiguated explicitly.

**Branch cleanup is scoped to branches the call created.** The create path
deletes its branch when a later step fails. The reuse path must not: that branch
belongs to a PR under review, and deleting it closes the PR and discards the
reviewer's context. Prefer a structure where the reuse path returns before the
cleanup handler is reachable over a flag consulted inside it.

**Author intent survives the reuse.** A redeploy carries a fresh description;
it is recorded on the PR (a comment) rather than dropped. Posting it is
best-effort — the artifact is already committed by then, so a failure to
annotate must not report a successful deploy as failed.

## Consequences

- New PR-based authoring flows inherit this shape. The dormant
  `POST /builder/publish` in `form_builder_api` (#2391) does not yet follow it
  and must either adopt it or be removed.
- `packages/git-publish` owns the transport primitives (`findOpenPRByHeadRef`,
  `commentOnPR`); the branch-naming scheme stays with the caller, which is why
  the finder takes a predicate rather than a prefix.
- The reuse path does not refresh the PR title, so renaming an artifact between
  deploys leaves the original title. Accepted: the diff still shows the truth.
- A form id that literally began with `erase-` would not be recognised as a
  Deploy branch and would degrade to opening a new PR each time — the safe
  direction, and the reason the erase namespace is rejected explicitly.
- Erase is not covered. An Erase PR and a Deploy PR can still be open against
  the same recipe. Erase is rare and this predates #2390; revisit if it bites.
