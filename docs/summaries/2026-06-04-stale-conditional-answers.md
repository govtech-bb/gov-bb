# Check-your-answers no longer shows de-selected conditional data (#737)

## Context

Issue [#737](https://github.com/govtech-bb/gov-bb/issues/737): on the
staging Job Start Plus form, answering "Have you had a paid job?" → Yes,
filling the revealed employment fields, then flipping to No left the
employment details visible on check-your-answers. The issue title said
"display-only", but the same defect leaked into the **submission payload**:
both the review filter and the submit path's `hiddenFields` collection read
the `conditionallyHidden` flag, which `field-renderer.tsx` mutates as a
render side-effect — a conditional field that never re-mounts after its
controlling answer flips keeps a stale flag. We confirmed the payload leak
end-to-end by intercepting the POST in a Playwright drive of `/forms/master`.

## What we did

Three commits on `worktree-737-stale-conditional-answers`, plus ADR 0040:

- `feat(forms)`: added `getVisibleFields(step, formApi)` to
  `behavior-helper.ts` — evaluates each field's `fieldConditionalOn`
  behaviours via the existing `checkConditionalOn` (the shared
  `@govtech-bb/form-conditions` evaluator the API uses); hidden when the
  verdict is `notRequired`, mirroring the renderer's mount-time gate.
- `fix(forms)`: switched both consumers — `review.tsx` filters rows through
  `getVisibleFields`; the submit path derives `hiddenFields` as the
  complement of the evaluated visible set per visible step.
- `test(forms)`: pinned OR semantics across multiple conditions and the
  condition-passes-but-empty (`requiredAndEmpty` → still visible) path.

Form state is never cleared, so keep-but-hide falls out for free: flipping
the answer back restores what the user typed.

## Why we did it that way

- **Evaluate, don't re-render.** The alternative — forcing the flag
  mutation to run for unmounted fields — keeps truth coupled to rendering;
  the same class of bug recurs with the next render-order change. Visibility
  is now derived from form state on demand (ADR 0040).
- **Keep-but-hide, not clear-on-change.** Clearing dependent values on a
  controlling-answer change destroys user input on a mis-click; the GDS
  pattern hides data, it doesn't erase it.
- **Repeatable steps keep flag behaviour.** Their fields have per-instance
  visibility (`activeFieldsByInstance` in `packages/form-conditions`) that a
  step-scoped evaluation can't represent. `getVisibleFields` falls back to
  the flag filter for steps carrying a `repeatable` behaviour — instance
  steps are spread-copies of the base so they retain it. Extending evaluated
  visibility per-instance is follow-up.
- **The renderer's own flag mutation stays.** It still governs what renders
  on a step; it just stopped being load-bearing for review/submit.

## Gotchas worth remembering

- The route spec (`index.spec.tsx`) mocks `@forms/lib` wholesale — a new
  export used by the route must be added to the mock factory or every
  onSubmit test fails with "not a function".
- The old review spec's "does not render conditionallyHidden fields" test
  passed for the wrong reason after the switch (the field had no answer, so
  the empty-row filter dropped it). It was re-pinned to evaluated semantics
  and verified to fail against the pre-fix `review.tsx`.
- Playwright drive of `/forms/master`: session-storage keys use the
  contract's `formId` (`master-form-v1`), not the URL slug; the step guard
  needs completion markers for both `step-5-financial-information` and its
  `~1` instance (the active id differs between fresh boot and restore).
- The verification screenshots showed **two "Financial Information"
  sections** on check-your-answers after a repeat-instance restore
  (base + `~1`) — pre-existing repeatable behaviour, not touched here,
  possibly worth its own issue.
