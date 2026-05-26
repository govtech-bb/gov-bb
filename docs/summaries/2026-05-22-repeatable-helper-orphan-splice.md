# removeRepeatableStep orphan splice — Session Summary

**Date:** 2026-05-22
**Branch:** fix/forms-failing-tests

## What was built

One line in
`apps/forms/src/lib/form-builder/helpers/repeatable-helper.ts:271` —
the splice deleteCount in the orphan-cleanup branch of
`removeRepeatableStep` changed from
`currentRepeatConfig.orderedStepIds.length - 2` to
`currentRepeatConfig.orderedStepIds.length - pos`.

Effect: when a step is found in `orderedStepIds` but missing from
`visibleSteps`, the orphan ID (and any trailing IDs) are now actually
removed from settings. Previously, for the common
`orderedStepIds.length === 2, pos === 1` case the expression
evaluated to `splice(1, 0)` — a no-op — and the dangling orphan
persisted in session.

## Why it looks the way it does

The pointer (from
`docs/plans/forms-test-review-source-fixes.md` on
`test/increase-coverage`) offered two candidate fixes:
`splice(pos, length - pos)` or `splice(pos, 1)`. Both go green on the
pinning test (`orderedStepIds.length === 2`). The first one was
chosen because it matches the happy-path branch directly below:

```ts
// happy path (step IS in visibleSteps)
const toRemove = orderedStepIds.slice(startIndex);
currentRepeatConfig.orderedStepIds = orderedStepIds.slice(0, startIndex);
```

That branch removes the target *and* everything after it. Picking
`splice(pos, 1)` would diverge — one branch trims the tail, the
other trims a single entry — and the two branches exist to handle the
same intent under different state conditions. Consistency wins.

`length - 2` was only coincidentally right when `pos === length - 1`
and `length >= 3`; for every other shape it either no-ops or strands a
trailing orphan. There's no array shape where the old expression was
right and the new one is wrong.

**Out of scope, flagged not fixed.** The orphan branch still doesn't
clean up `formMeta.steps` (the happy path does, at lines 288–294). If
an orphan is conditionally hidden rather than truly gone, the
`formMeta.steps` entry survives. Pre-existing, not introduced or
worsened by this fix. Kept scoped to the splice on user direction.

**Verification deferred.** Per the
[forms-test source-fix pattern](../../README.md), the pinning red
test (`removes the orphan id from orderedStepIds when targetStep is
not in visibleSteps`) lives on `test/increase-coverage` and is not
present on this branch. Red→green confirmation happens once branches
share history.
