# 2026-06-05 — Deploy race guards (#873)

## Context

Issue #873: two deploys (or a manual recipe PR + a builder deploy) could
silently claim the same recipe version — the second merge buried the first
author's changes. Session executed a pre-written plan
(subagent-driven, TDD per task) on worktree branch `deploy-race-guards-873`
off `sandbox`.

## What we did

Three composing layers (see ADR 0041 for the principles):

- **CI**: `scripts/recipe-version-guard.ts` + a `recipe-version-guard` job —
  immutability rule (override label, deletions exempt) + cross-PR collision
  rule (older PR wins). Commits `14a73367`, `172da4ee`, `e19b81c0`, `80332108`.
- **Resolution**: `getNextDeployVersion` server fn bumps past
  max(loaded version, base-branch files, open deploy-PR claims via the new
  `deployBranchPrefix`). Commit `8ac3a30f`.
- **Reservation**: `publishRecipe` gained a stale-version gate, an atomic DB
  claim via `POST /builder/forms` (409 → "claimed" guidance), and a
  single-point release on any post-reservation failure. Commits `b6413ffb`,
  `9c4f157c`, `854335d6`. UI resolves the version on modal open and rolls
  local state to the deployed version on success (`291810c9`, `fb27b8ab`).

## Why we did it that way

- **Reservation reuses `POST /builder/forms`** instead of a new table or
  endpoint: the existing `UNIQUE(form_id, version)` is already the right
  arbiter, and the claim row doubling as a visible pending-deploy draft means
  other users' pickers bump past in-flight deploys for free.
- **Older PR wins on collisions** because symmetric failure would deadlock
  both PRs; the newer author re-bumps.
- **Labels are read live in the CI guard, not from the event payload.** The
  workflow doesn't retrigger on `labeled`, and "Re-run failed jobs" reuses the
  stale payload — with a payload read, the override label could never take
  effect without a new push. Adding `labeled` to the workflow's trigger types
  was rejected: it would re-run the entire CI suite on every label event.
- **Release was restructured to a single outer try/catch** after review found
  the plan's literal wiring (release on `!res.ok` branches only) leaked the
  reservation on network errors and malformed-200 `.json()` throws.
- **The true concurrent race returned 500, not 409**: `createFormHandler`'s
  duplicate check is a non-atomic `findOne`, so simultaneous racers both pass
  it and the loser hits the DB constraint → generic catch. Mapped Postgres
  `23505` → the same 409 body, so the friendly "claimed, reopen and retry"
  message fires in exactly the scenario the issue describes.

## What we almost got wrong

- The plan's Task 4 mock values would have tripped the very gate being built
  (`dirListing(["1.2.0"])` against a 1.2.0 deploy), and the spec file's
  `jest.mock("./api-client", factory)` silently swallowed the real `ApiError`
  class — `instanceof` in the SUT would have matched `undefined`. Both caught
  before dispatch by reading the harness first; fixed with 404/lower listings
  and a `jest.requireActual` passthrough.
- An Anthropic platform outage (529s + permission-classifier downtime) hit
  mid-session; Task 1's spec was written inline during the gap and the
  implementer dispatch doubled as the retry timer.

## Open questions

- When the older colliding PR merges/closes, the newer PR's failed guard
  doesn't auto-re-run (GitHub can't trigger cross-PR); the author re-runs or
  pushes. Accepted in the plan.
- `getNextDeployVersion` only recognises builder-named deploy branches; a
  manual recipe PR is invisible to resolution until merged — the CI guard is
  the backstop for that window (documented in code).
- Editing presence / advisory locking is deferred to #874.
