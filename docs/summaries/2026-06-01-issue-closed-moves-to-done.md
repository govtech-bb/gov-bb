# Manually closing an issue as completed moves it to Done

**Issue:** [#491](https://github.com/govtech-bb/gov-bb/issues/491)

## Context

The Alpha² board automation (`scripts/project-board-sync.ts` +
`.github/workflows/project-automation.yml`) drove every status transition from
issue labels and PR activity, but had no handler for an issue being **closed
directly** on GitHub. A maintainer who closed an issue by hand — rather than by
merging a linked PR — left its board item stranded in whatever column it was
last in. The board no longer reflected reality.

## What we did

Added a sixth behaviour: `issues.closed` with `state_reason == "completed"` →
ensure the item is on the board → Status = **Done**.

- **`.github/workflows/project-automation.yml`**: subscribed the workflow to the
  `closed` issue event (`types: [opened, labeled, closed]`).
- **`scripts/project-board-sync.ts`**: `decideActions` now handles the `closed`
  action, emitting `[ensureOnBoard, setStatus: "Done"]`. Added `stateReason?` to
  the issues variant of `SyncInput` and wired `payload.issue.state_reason`
  through in `main()`.
- **`scripts/project-board-sync.spec.ts`**: three new `decideActions` cases —
  closed-as-completed → Done, closed-as-not-planned → no actions,
  closed-with-no-reason → no actions.
- **`docs/superpowers/specs/2026-05-29-board-label-automation-design.md`**:
  documented the new behaviour, the event-table row, and the merge-path edge
  case; disambiguated the "Mutual exclusion" heading (it references the
  behaviours-list item, not the event-table row).

## Why we did it that way

- **Gate on `state_reason == "completed"`, not on close alone.** GitHub lets an
  issue be closed as _completed_ or _not planned_. "Done" carries a
  completed-the-work meaning, so a "not planned" close (abandoned, duplicate,
  won't-fix) is deliberately a no-op — moving it to Done would misrepresent it.
  A close with no `state_reason` is treated the same as not-planned (no-op).
- **No `closeIssue`/`removeLabel` in this handler.** The issue is _already_
  closed (that's what triggered the event), and label hygiene is the merge
  path's concern. The handler does the minimum: park it in Done.
- **Idempotent with the PR-merge path.** When rule 4 merges a PR it closes the
  linked issue, which GitHub records as `state_reason = completed` and re-emits
  as `issues.closed`. That fires this new handler, which simply re-sets Done —
  no conflict, no loop (the board write is idempotent).

## Verify

- `jest` board-sync suite: 20/20 pass (3 new).
- `nx run-many -t build --exclude=landing`: green (13 projects; landing excluded
  — its prebuild needs network, per CLAUDE.md).
- `nx run-many -t test --exclude=landing`: 623 pass / 1 skipped.
  `form-builder-app` flaked once on worker teardown in the batch run but passes
  211/211 on a clean isolated re-run — unrelated to this change.
- Not runnable end-to-end locally (needs a live GitHub Actions event + the org
  App token); the pure `decideActions` logic is fully unit-covered.

## Note

This session also added an unrelated convention to `CLAUDE.md`: **open PRs
against `sandbox` by default, not `dev`** — committed separately.
