# Plan: make `check-your-answers` an authored builder step

## Goal

Promote the `check-your-answers` review step from a runtime-injected step (added
silently by the forms app at render time) into a **first-class required step in
the form builder** — visible and editable in the step checklist, sitting right
before `declaration`.

Authors should be able to see it, rename it, and edit its description, but — like
`declaration` and `submission-confirmation` — they cannot move it, delete it, or
change its Step ID. It accepts **no fields** and is allowed to have empty fields
(no validation error for being empty).

## Why

Today `check-your-answers` is invisible to form authors: it only materialises at
runtime in `apps/forms`. Authors can't see it in the step list or adjust its
title/description. Making it an authored required step gives transparency and
lets authors edit its copy, while keeping its placement and field-free nature
enforced by the builder rather than by an out-of-band runtime splice.

## Approach

The builder's required-step machinery already does almost everything we need:

- `REQUIRED_STEP_IDS` drives the pinned tail; `ADD_STEP`, `REORDER_STEPS`, and
  `-step-list.tsx` all derive the tail size from `REQUIRED_STEP_IDS.length`, so
  they self-adjust when the array grows from 2 to 3.
- Ordering within the tail follows the order of `REQUIRED_STEP_IDS`, so listing
  `check-your-answers` **first** yields `[check-your-answers, declaration,
  submission-confirmation]` — i.e. right before `declaration`.
- `LOAD_DRAFT` already rebuilds the required tail from `REQUIRED_STEP_IDS`,
  inserting any missing required step with defaults. This **is the migration
  path**: existing recipes opened in the builder automatically gain the step.
- The Step ID input is already `readOnly` for required steps, so the locked ID
  comes for free.

So the core change is: add the step to the required set, fix one hardcoded title
lookup, hide the field picker for field-free steps, make the runtime injection
idempotent, and update the AI prompt.

### Field-picker scope (decision: **Narrow**)

The "Add field" picker is currently shown for *all* required steps, so even
`submission-confirmation` can have fields added via the UI today (only the AI
prompt discourages it; nothing enforces it). We introduce a small **no-fields
set** — `check-your-answers` + `submission-confirmation` — and hide the
FieldPicker for those, leaving `declaration` field-editable (it needs the
confirmation checkbox). This both satisfies "check-your-answers accepts no
fields" and closes the existing `submission-confirmation` leak with one
consistent rule.

### Alternatives considered

- **Minimal field-picker scope** — hide the picker for `check-your-answers` only,
  leave `submission-confirmation` as-is. Rejected: leaves the existing leak and
  special-cases a single ID rather than modelling "field-bearing vs not."
- **Remove runtime injection entirely + migrate stored recipes** — cleaner long
  term but riskier; any already-published form lacking the step would break.
  Idempotent injection keeps old forms working with no migration.

## Scope

- Add `"check-your-answers"` as the **first** entry of `REQUIRED_STEP_IDS` and of
  `makeRequiredSteps()` (title `"Check your answers"`, with the standard review
  description).
- Replace the 2-way title ternary in `LOAD_DRAFT` with a 3-way lookup (a small
  id→default-meta map) so a missing `check-your-answers` is seeded with the right
  title/description.
- Introduce a `NO_FIELDS_STEP_IDS` set (`check-your-answers`,
  `submission-confirmation`) + an `isNoFieldsStep()` helper in
  `-recipe-reducer.ts`; hide the "Add field" section / FieldPicker in
  `-step-editor.tsx` when `isNoFieldsStep(step.stepId)`.
- Make `build-form.ts` injection idempotent: if a step with id
  `check-your-answers` already exists in `contract.steps`, skip the find-and-
  splice entirely; otherwise inject before `declaration` (current behaviour).
- Update the AI system prompt (`system-prompt.ts`) so the model knows
  `check-your-answers` is an auto-managed, field-free step it should not author
  fields into (mirror the existing `submission-confirmation` rules).

## Files

- `apps/form_builder/app/routes/builder/-recipe-reducer.ts` — `REQUIRED_STEP_IDS`,
  `makeRequiredSteps()`, `LOAD_DRAFT` title lookup, new `NO_FIELDS_STEP_IDS` /
  `isNoFieldsStep()`.
- `apps/form_builder/app/routes/builder/-step-editor.tsx` — conditionally hide the
  "Add field" / FieldPicker section for no-fields steps.
- `apps/forms/src/lib/form-builder/build-form.ts` — idempotent injection guard.
- `apps/form_builder_api/src/ai/system-prompt.ts` — AI rules for
  `check-your-answers`.
- (Verify only — no change expected) `apps/forms/src/components/review.tsx`
  exclusion list already covers all three required ids.

## Verify

- `pnpm exec nx run-many -t build --exclude=landing` and
  `pnpm exec nx run-many -t test` both green.
- In the builder: a **new** form shows `Check your answers` in the step list,
  pinned above `Declaration`; it can't be moved/deleted, its Step ID is
  read-only, its title/description are editable, and it shows **no** "Add field"
  control.
- Opening an **existing** recipe (one saved before this change) shows the step
  inserted in the right place with sensible defaults (exercises `LOAD_DRAFT`).
- In `apps/forms`: a form whose contract **already contains**
  `check-your-answers` renders exactly one review step (no duplicate) — confirms
  idempotent injection. A legacy contract **without** it still gets one injected.
- `submission-confirmation` no longer offers an "Add field" control (the closed
  leak).

## Open questions

- Default description copy for `check-your-answers` in the builder: reuse the
  runtime string ("Review all the information you have provided before submitting
  your application.") or a shorter author-facing one? Defaulting to reuse unless
  told otherwise.
- No GitHub issue currently tracks this. Worth opening one (labels:
  `enhancement`, `subsystem:form-builder`, `subsystem:forms`) before
  implementation — confirm if you'd like that.
