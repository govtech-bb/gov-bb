# `check-your-answers` becomes a first-class authored builder step

## Context

Implemented from `docs/plans/check-your-answers-builder-step.md` on worktree
branch `worktree-feat+521-check-your-answers-builder-step` (merges into
`sandbox`). Issue [#521](https://github.com/govtech-bb/gov-bb/issues/521).

Until now `check-your-answers` only existed at runtime: `apps/forms`'
`build-form.ts` spliced a review step in before `declaration` every time a form
rendered. Authors never saw it in the builder, couldn't rename it or edit its
description, and the placement/field-free rules lived in an out-of-band runtime
splice rather than in the builder's required-step machinery.

The goal: promote it to a first-class **required** builder step — visible and
editable like `declaration` and `submission-confirmation`, pinned right before
`declaration`, locked against move/delete/ID-change, and accepting no fields.

## What we did

- **Required-step set grew from 2 to 3.** Prepended `"check-your-answers"` to
  `REQUIRED_STEP_IDS` in `-recipe-reducer.ts`. The existing tail machinery
  (`ADD_STEP`, `REORDER_STEPS`, `-step-list.tsx`) all derive the pinned-tail size
  from `REQUIRED_STEP_IDS.length`, so they self-adjusted; listing it **first**
  yields `[check-your-answers, declaration, submission-confirmation]`.
- **`makeRequiredSteps()` + `LOAD_DRAFT` now share one defaults map.** Replaced
  the two hand-written step literals and the 2-way title ternary with a single
  `REQUIRED_STEP_DEFAULTS` (id → title/description). `check-your-answers` reuses
  the runtime review copy verbatim.
- **No-fields steps modelled as a set.** New `NO_FIELDS_STEP_IDS`
  (`check-your-answers` + `submission-confirmation`) + `isNoFieldsStep()`;
  `-step-editor.tsx` hides the whole Fields section (list + FieldPicker) when
  `isNoFieldsStep(step.stepId)`.
- **Runtime injection made idempotent.** `build-form.ts` now skips the splice
  when a `check-your-answers` step already exists in the contract.
- **AI prompt rule.** Added Rule 15 to `system-prompt.ts`: never author a
  `check-your-answers` step; it's platform-managed and field-free.

## Why we did it that way

- **Reused the required-step machinery instead of a bespoke pin.** The builder
  already pins a tail of required steps and derives everything off
  `REQUIRED_STEP_IDS.length`. Adding one array entry (plus the defaults-map
  seeding) was enough — no new ordering or locking code. The read-only Step ID
  input keyed off `isRequiredStep` came for free.

- **`LOAD_DRAFT` *is* the migration path — no data migration written.** Older
  recipes saved before this change have no `check-your-answers` step.
  `LOAD_DRAFT` already rebuilds the required tail from `REQUIRED_STEP_IDS`,
  inserting any missing required step with defaults, so simply opening such a
  recipe in the builder materialises the step in the right place. We deliberately
  did **not** remove runtime injection and migrate stored recipes: any
  already-published form lacking the step would break. Idempotent injection keeps
  legacy forms working with zero migration.

- **No-fields modelled as a set, not a single-ID special-case.** The picker was
  shown for *all* required steps, so `submission-confirmation` could already have
  fields added via the UI (only the AI prompt discouraged it — nothing enforced
  it). Introducing `NO_FIELDS_STEP_IDS` both satisfies "check-your-answers takes
  no fields" and closes that pre-existing `submission-confirmation` leak with one
  consistent rule. `declaration` is intentionally excluded — it bears the
  confirmation checkbox and must stay field-editable.

- **Defaults centralised so seeding can't drift.** With three required steps the
  old 2-way title ternary in `LOAD_DRAFT` couldn't express the third. Rather than
  extend the ternary, both `makeRequiredSteps()` and `LOAD_DRAFT` now read the
  same `REQUIRED_STEP_DEFAULTS` map, so a new form and a migrated form seed
  identical copy.

## What we almost got wrong

The edits were initially applied to the **main repo** working tree (via absolute
paths captured before entering the worktree) rather than the worktree itself, so
the first "green" test run actually exercised the *unchanged* worktree files. The
new assertions were not really verified until the six changed files were moved
into the worktree and the suite re-run there. Re-running against the correct tree
confirmed: `form-builder-app` 239 tests, plus `forms` and `form-builder-api`, all
green; full `nx run-many -t build --exclude=landing` green.

## Open questions

- The `-step-editor.tsx` field-hiding has no component-level test (the repo has
  no existing `StepEditor` spec to extend). The behaviour delegates entirely to
  `isNoFieldsStep`, which **is** unit-tested in `-recipe-reducer.spec.ts`, so the
  decision logic is covered even though the JSX guard isn't.
