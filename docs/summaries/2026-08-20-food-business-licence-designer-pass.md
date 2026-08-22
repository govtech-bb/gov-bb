# Session summary — food business licence designer pass

**Date:** 2026-08-20 · **Branch:** `food-business-licence-review-feedback` (off
`main`) · no tracking issue (sibling: #2345, the same pass on the restaurant
licence form)

## Context

A designer reviewed `apply-for-food-business-licence` and returned eighteen
notes — a mix of directives ("remove Rubbish and food waste"), half-questions
("where is the limit? hot food / cold food / international food?") and one
single-word margin note ("Revolve"). The form was a twelve-step
question-for-question conversion of the paper form. This session applied the
notes.

## What shipped

- The recipe, edited in place: three steps deleted, two added, twelve field-level
  changes. Diff speaks for itself.
- `apply-for-food-business-licence.spec.ts` — hydration guard, see below.
- [ADR 0068](../decisions/0068-environmental-health-forms-do-not-ask-what-the-inspection-verifies.md)
  — the principle behind most of the deletions, previously unwritten.

## Why it looks the way it does

**Ambiguity was resolved by asking, not guessing.** Four notes had more than one
defensible reading, and the readings led to materially different forms. "Revolve"
against the hand-washing question is the clearest case — plausibly "Resolved"
(keep it), plausibly "revise" (reword it). Guessing "keep" would have silently
retained a question the designer wanted gone; the answer was in fact *remove*.
Similarly, "number of people by sex" could add a breakdown beside the existing
total or replace it — replacing was chosen, which removes the possibility of a
breakdown that disagrees with its own total. The polyclinic note turned out to
describe a question **this form has never contained**, so it was a no-op here;
it belongs against the restaurant forms, which do route by polyclinic.

**The suppliers question drove the shape of the change.** The designer's "I could
sell cakes from 7 bakeries and Twinkies from America, how are we handling that"
is not answerable by a better list of food categories — that is what the deleted
Food and drink step was attempting. It is answerable by capturing each supplier.
That forced a structural choice: `fieldArray` repeats *one* field, `repeatable`
repeats *a group*, and a supplier needs a name plus four address lines plus a
transport method. So the prepared-elsewhere fields were lifted out of
`where-food-is-prepared` into their own repeatable step, gated by
`stepConditionalOn` with the `in` operator against the existing checkbox. The
moved fields lost their now-redundant field-level conditionals — the step gate
subsumes them — but kept every `required`.

**The warning renders once, not per instance.** The supplier-licence warning was
initially going to sit at the top of the repeatable step, where it would repeat
with every instance. Checking `field-renderer/index.tsx` showed `content`
elements honour `fieldConditionalOn`, so it lives on the *gating* step instead,
conditional on the same two checkbox values — it appears the moment an off-site
option is ticked, exactly once.

**The floor plan had to be added, not edited.** The note read as a tweak to an
existing question ("if you don't have the floor plan you can provide the...
number"), but the form had no floor plan field at all. Both halves are new, built
on the guardrails' Alternative Identity Pattern: upload + `show-hide` toggle +
`optionalIf` relaxing the upload. Missing that third part is the difference
between a working alternative route and an unsubmittable form.

**The spec exists because a dropped behaviour is silent.** `recipe-invariants`
and `validate-recipes` both read the file on disk, so neither can tell whether
`hydrateForm` carries a behaviour onto the served contract. This recipe is the
first in the repo to use `fieldArray`, and its floor-plan `optionalIf` is
load-bearing: lose it and the upload stays hard-required next to its own opt-out
toggle. The spec hydrates the real recipe through the real resolver and asserts
the four fragile behaviours survive — same pattern and rationale as
`request-an-environmental-health-officer.spec.ts`. It passed on the first run, so
it was mutation-tested (strip the `fieldArray`, the `optionalIf`, the step gate)
to confirm it actually fails when it should.

**Two things were deliberately left alone.** The recipe authors its own
`check-your-answers` step, which the AI system prompt's Rule 15 forbids — but
Rule 15 governs *generation*, and `build-form.ts:27` shows the builder authors it
as a first-class step and the runtime guards against duplicating it. 47 of 82
recipes carry one. Not a defect. And `meta.visibility` stays `preview`.

## What we almost got wrong

Reported the `check-your-answers` step as a probable problem on the strength of
Rule 15 alone, before reading the runtime. `build-form.ts` contradicts the rule
outright for existing recipes. Reading the prompt is not the same as reading the
code the prompt describes.

## Open questions

- **Not smoke-tested in a browser.** Docker was not running locally, so Postgres
  was down and the API could not boot. Hydration is verified; the rendered UI is
  not. The multi-phone control, the van branch and both floor-plan routes are the
  things to click.
- `add-form-definition-unique-constraint.smoke.spec.ts` fails locally without a
  Postgres. Confirmed pre-existing by re-running with the change stashed.
- The stepId `preparing-food-at-business` was renamed to
  `people-working-at-the-food-business` to match its new title. Safe here because
  nothing referenced it and the form is `preview`; on a live form that rename
  re-keys submitted data.
- `about-the-food-business` now holds 12 elements against the guardrails' 8–10
  guideline. Conditionals mean ~9 are ever visible at once. Left as-is.
