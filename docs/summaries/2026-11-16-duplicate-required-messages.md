# Duplicate required messages on a step

2026-11-16 · recipes, scripts, form-validation · #2723, follow-up #3720

## Context

The forms error summary uses each field's required message as its link
text. The #2227 guard only rejected five field-less wordings, so two fields
on one step could share any other message and show identical links that
jump to different fields. On `main` that was 32 groups (148 fields) in
14 recipes.

## What we did

- `checkRequiredErrorsAreSpecific` (`scripts/required-error-guards.ts`) also
  groups each step's resolved fields by `requiredMessageWording` (exported
  from form-validation) and rejects any group of two or more.
- Fixed the recipes:
  - 106 "select all that apply" checkboxes and 5 "Other (please specify)"
    boxes beside them made optional;
  - 5 fields whose wording says they're optional made optional;
  - project-dawn's duplicate `employment-education` step deleted;
  - 31 messages rewritten to name their field.

## Why we did it that way

- **Most of the 148 weren't message bugs.** 106 were options in
  "select all that apply" lists built from separate `components/confirmation`
  checkboxes. That component is required by default, so applicants had to
  tick every option: Asthma *and* Epilepsy *and* None. Rewording them would
  have hidden that. We set `required: false` instead of rebuilding each list
  as one `generic-checkbox` field. The rebuild is the right model, but each
  list needs a heading, a "pick at least one?" decision and new wording.
  These forms are disabled cohort forms (`…-2025`) that need content work
  before any re-run anyway, so the rebuild is tracked in #3720. The cost
  until then: no list can require "at least one", and BSSEE Form B can be
  sent with no deferral reason ticked (accepted).
- **The same reasoning covered fields the check didn't flag.** The
  "Other (please specify)" boxes are `components/name`, which is required
  by default, and have no show/hide condition. Each is alone on its step, so
  the new check doesn't see them, but leaving them required would keep the
  steps blocked that the list fix was meant to unblock.
- **Conditions are ignored on purpose.** Fields that never show together
  (metres/feet) still need their own messages. Reasoning about conditions is
  how the nhc `notEqual` collision slipped through: `notEqual` is true when
  the target is unanswered, so both fields render on a blank step.
- **Messages are compared after the denylist's normalisation** (trim, lower
  case, drop a trailing `.`/`!`), because "Name is required" and "Name is
  required." read as the same link.
- **Only unauthored dates are skipped.** An authored date message is shown
  word for word, so it can collide like any other field. This matches
  `requiredMessageDefect`.
- **project-dawn's step was deleted, not reworded.** It held two identical
  free-text "Employment Status" fields, and the next step asks the same
  question properly as a radio. Nothing referenced the step.
- **Wording follows the house pattern** "{Label} is required" (the
  `form-design` skill), or each recipe's own "Select …" style for choice
  fields, rather than the plan's "Enter the …" suggestions.
- **No change to the Form Builder's Deploy gate (#2714).** The builder is
  being deprecated, and its Deploy PRs still have to pass `validate-recipes`.

## What we almost got wrong

- The plan checked the change by opening the PR preview. The preview's forms
  app calls the deployed sandbox API, not the branch's recipes, so the
  rewritten messages only show on sandbox after merge.

## Open questions

- #3720: rebuild the 14 lists as checkbox-group fields, restore
  "pick at least one" where it's wanted, and drop the `" "` labels.
