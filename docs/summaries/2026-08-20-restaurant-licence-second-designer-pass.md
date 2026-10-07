# Session summary — restaurant licence form, second designer pass

**Date:** 2026-08-20 · **Branch:** `restaurant-licence-form-edits` (off `main`)
· form `apply-for-restaurant-licence` (still `visibility: preview`)

## Context

A second, smaller designer pass over the same recipe the
[first pass](2026-08-20-restaurant-licence-form-updates.md) reshaped earlier
that day. Three asks: drop the "Do you have your restaurant licence or
reference number?" question, make "Address line 2" optional, and drop "Town or
district" from the About the restaurant step. Then an open-ended one — think
about how entering opening hours could be better.

## What we did

Two commits on the recipe plus its hydration spec, then one guardrail edit.

- **`279fd635`** — the three asks, plus two defects found on the same step.
- **`65a3c7f4`** — a "same hours every day?" gate on the opening-hours step.
- Follow-up filed: **#2358**, a `time-range` field.
- Authoring convention added to `apps/form_builder_api/src/ai/system-prompt.ts`
  ("Ask One Question Once, Not Once Per Item").

## Why we did it that way

**Reading the guardrails first paid for itself immediately.** The
`/form-design` skill insists on reading `system-prompt.ts` before touching
anything, including for a one-field edit. Doing that surfaced two live defects
sitting on the very step being edited, neither of them mentioned in the ask:

- `relationship-other` was `required: true` with **no** `fieldConditionalOn`.
  It rendered for everyone, so an applicant who picked "Owner" was still forced
  to type an answer to "Tell us your relationship to the restaurant".
- `relationship-to-restaurant` was a `generic-radio` with **six** options —
  Rule 8 makes anything past two a select.

**The licence number field was worse than the question gating it.** The ask was
to remove the yes/no gate. Reading the recipe showed the gate did nothing: the
`licence-number` field it supposedly controlled had no condition on it and no
`required: false`, and `generic-text` ships `required: true` — so it was
mandatory for every applicant, including first-timers who by definition have no
licence number. Three options went back to the designer (keep it renewals-only,
keep it always-visible, or remove it); they chose removal, on the grounds that
Environmental Health matches renewals from their own records.

**"Address line 2" was made optional in all four places, not one.** The ask
named one field; the guardrail (CATEGORY 2) makes every continuation line
optional, and `components/address` ships `required: true`, so all four were
mandatory. Open issue #2337 is the same defect on the hotel form. Widening the
scope was checked with the designer rather than assumed.

**Opening hours: the repetition was the problem, not the format.** Four options
were put up. The strongest on paper was replacing the step with a `repeatable`
one carrying two `components/generic-time` fields — native time pickers, no
typing, structured data downstream, and explicitly the alternative
[ADR 0069](../decisions/0069-paired-values-are-one-repeated-field.md) names for
a pair that must stay structured. The runtime already supports it:
`field-renderer/index.tsx` routes `time` to `renderTextField` and
`render-context.ts` sets `type: field.htmlType`, so `<input type="time">`
renders today with no platform work.

The designer chose the cheaper option instead — a "same hours every day?" gate.
That is a defensible trade: it removes the repetition (Mon–Sat on one timetable
goes from six typed ranges to one) which is the cost most applicants actually
pay, without restructuring a step that had just been through review. What it
does not remove is the format burden, and that gap is real: `9.00 - 17.00` is
still rejected, and a 24-hour restaurant still cannot answer the question at
all. That is #2358, which proposes a `time-range` field — two native pickers
behind one `HH:MM - HH:MM` value, so ADR 0069's one-field invariant survives
and the typing does not.

**The gate leans on stacked-condition AND semantics.** Each per-day field now
carries two `fieldConditionalOn` behaviours: its day is ticked, AND the hours
are not the same every day. That only works because multiple conditions
intersect rather than union — `checkConditionalOn` runs `.every()`
(`behavior-helper.ts:43`), matching `applyConditions` in
`@govtech-bb/form-conditions`, which is what the API applies. Under OR, every
ticked day would render its own field next to the shared one and the applicant
would answer twice. That was verified in the source before authoring, and the
platform already pins it (`behavior-helper.spec.ts:393`).

**Every new assertion was run against the pre-change recipe first.** All
fourteen failed, which is the only reason to trust that they test anything. The
`serves … as optional` cases matter most: `required: false` is an *override*
merged over a registry default, so reading the recipe file alone would not
prove it survives hydration — which is exactly how #2337 stayed hidden.

## What we almost got wrong

- **The `nx dev api` failure looked like a worktree problem.** It was not: the
  root script is `dev:api`, which symlinks `node_modules/@ → dist/apps/api/src`
  to resolve the `@/` path alias at runtime. Running `nx dev api` directly
  skips that and dies on `Cannot find module '@/catchment/...'`.
- **A test run got greener, then redder, for environmental reasons.** The api
  suite passed 1380/1380 early on, then failed one spec later —
  `add-form-definition-unique-constraint.smoke.spec.ts`. Copying `apps/api/.env`
  into the worktree (needed to run the dev servers) un-skipped eight DB specs.
  That one seeds a duplicate `(form_id, version)` row to prove the migration
  fails loudly, but the local dev DB already has the constraint, so the INSERT
  is rejected during setup. Local DB state, unrelated to the diff — but it
  would have been easy to read as a regression.
- **A "same for all?" gate was nearly written up as an ADR.** It reads like a
  principle, but one instance is not a pattern, and authoring conventions are
  already centralised in `system-prompt.ts` where an author will actually meet
  them. It went there instead, with a pinning test, and with an explicit
  "don't do this when the answers genuinely differ per item" caveat.

## Open questions

- The `opening-hours` step now holds 10 authored elements — the top of Rule 10's
  8–10 range. At most three render on the "yes" path, but there is no headroom
  left on that step.
- A restaurant open on a single day is still asked whether the hours are the
  same on every day it is open. There is no operator for "more than one box
  ticked", so it cannot be gated away. Both answers lead somewhere sensible, so
  it is cosmetic.
- The smoke spec `apps/forms/e2e/smoke/apply-for-restaurant-licence.smoke.spec.ts`
  is still stale from the first pass — it drives the 7-step recipe that
  `apply-for-restaurant-licence` replaced. No workflow runs it, and this session
  did not fix it.
