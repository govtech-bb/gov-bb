# Repeatable steps: 1-based min/max (#771)

## Context

Repeatable-step `min: 0` meant "base step only, no extras" — nearly identical
to `min: 1` at runtime and routinely misread as "no entries at all". Issue
#771 made `min` a 1-based total (integer >= 1) and `max` a total cap
(integer >= min), without breaking any published recipe. A design doc
(`docs/superpowers/specs/2026-06-04-repeatable-min-one-based-design.md`) and
plan were written the same day; this session executed the plan task-by-task
with per-task spec + quality reviews.

## What we did

- `feat(forms)`: `getEffectiveRepeatBounds` normalizes bounds once in
  `repeatable-helper.ts`; the dead `min: 0` else-branch is gone.
- `feat(form-types)`: `validateFormContract` post-parse pass rejects bad
  bounds at builder save; zod schemas untouched.
- `feat(form-builder)`: param-driven descriptor metadata
  (`defaultValue`/`minValue`/`atLeastParam`); editor inits repeatable at
  `{min: 1, max: 5}`, clamps inputs, drags Max up when Min passes it.
- `feat(api)`: `post-office-redirection-individual` `1.3.0.json` (the only
  recipe with `min: 0`), refreshed after rebase from sandbox's updated `1.2.0`.
- ADR 0036 records the three-layer enforcement split.

## Why we did it that way

- **Lenient parse + strict save + runtime clamp** over schema tightening,
  zod transforms, or UI-only fixes — see ADR 0036 for the full rejection
  reasoning. The short version: published versions must keep loading, authors
  must hear about bad config rather than have it silently corrected, and
  hand/AI-authored recipes bypass the UI.
- **`Infinity` as the "no usable cap" sentinel** is safe because nothing reads
  `repeatConfig.maxRepeats` back and the config lives in a React ref, never
  JSON-serialized — traced explicitly during review.
- **The bare-behaviour regression guard matters most**: conductor `1.0.0`
  ships `{ "type": "repeatable" }` with no bounds. Naive clamping computes
  `canAddMore = 1 < undefined === false` and silently drops the "Add another?"
  control. A dedicated test pins it.
- **Version bump despite ADR 0035**: `min: 0 → 1` invalidates nothing, so an
  in-place edit was technically allowed — but this is a semantics migration,
  not a relaxation, and the bump documents it. ADR 0036 makes that
  distinction explicit.

## What we almost got wrong

- **Stale base, twice.** The worktree was created from a stale local
  `origin/sandbox`; caught after Task 1 (cheap rebase). Then, after Tasks 2–4,
  the final whole-branch review noticed `1.2.0.json` had been edited in place
  on sandbox (#761's passport-toggle relaxation, sanctioned by ADR 0035) —
  *after* the rebase point. The first `1.3.0.json` copy would have silently
  reverted those fixes the moment it became served-latest. Re-fetched, rebased
  again (resolving the predicted #768 conflict in the `repeatable` descriptor
  — both sides additive), and regenerated `1.3.0` from the current `1.2.0`.
  Lesson: a copied artifact is stale the moment its source moves; re-diff the
  source before finishing.
- **A shared-fields hole hidden in the deleted branch.** The legacy `min: 0`
  else-branch never materialised instances for shared-fields steps; clamping
  to 1 changes that combination's rendering. No shipped recipe has
  `min: 0` + sharedFields (verified by inventory), so parity holds in
  practice — flagged in review as forward-looking only.

## Open questions

- #742 (cross-referenced) touches the same normalization path but is verified
  separately — not closed by this work.
- `fieldArray` (field-scoped repeatable) still has unguarded bounds; ADR 0036
  prescribes where its rules go when someone picks it up.
