# 0077 — The declaration uses the standard statement; anything extra is a separate acknowledgement

**Date:** 2026-10-08
**Status:** Accepted
**Supersedes:** [ADR 0041](./0041-declaration-step-contains-exactly-one-field.md)
**Related:** [#2920](https://github.com/govtech-bb/gov-bb/issues/2920) (the
content designer's standard), [#2930](https://github.com/govtech-bb/gov-bb/pull/2930)
(hotel and lodging), [#2957](https://github.com/govtech-bb/gov-bb/issues/2957)
(every other form)

## Context

ADR 0041 fixed the declaration checkbox's fieldId, label and required
validation. It left the statement next to the checkbox open to each form, and
it allowed nothing else on the declaration step.

By October 2026, 77 recipes had a declaration. 45 shared a long sentence that
added consent to verification, a warning about false information, and a
confidentiality promise. This was a platform pattern copied to every form,
not something each service needed. About 30 more had drifted into their own
wording. Some of those carried clauses that genuinely belong to one service.
Examples are a parent or guardian confirmation, consent to a named check, or a
rule the applicant must follow. With only one element allowed, those clauses
could only sit inside the declaration sentence.

The content designer set a standard on #2920 and clarified it on #2957. Every
form uses the same short declaration. A service with a genuine legal or
operational need adds its point alongside the declaration, worded for that
service, never inside it.

## Decision

The `declaration` step of every form:

- Is titled **"Confirm and submit your application"**.
- Contains the `components/confirmation` checkbox with fieldId
  `declaration-confirmed` and label `Declaration`. Its single option reads
  **"I confirm that the information I have provided is true and correct to the
  best of my knowledge."**, and its required error is **"You must confirm the
  declaration to continue."**. None of this varies by form.
- May also contain a required `components/confirmation` acknowledgement, with
  its own fieldId and `ui.hideLabel`, for a point genuinely specific to the
  service. Generic consent to verification and generic false-information
  warnings do not qualify.
- Never contains a declaration date, signature, printed name, witness or
  similar. These still belong on a regular step before the declaration, as in
  0041.

`chat-feedback` is exempt. It is a feedback survey, and the chat auto-confirms
its declaration step (ADR 0049).

The contract is held in three places that must agree:

- **Committed recipes:**
  `apps/api/src/forms/form-definitions/declaration-wording.spec.ts` checks the
  wording on every recipe. It also pins each form's existing acknowledgement,
  so an edit can't drop one quietly.
- **Builder seeding:** `makeDeclarationField()` and `REQUIRED_STEP_DEFAULTS` in
  `apps/form_builder/app/components/builder/recipe-reducer.ts`.
- **AI generation:** Rule 17 and the Declaration Checkbox Pattern in
  `apps/form_builder_api/src/ai/system-prompt.ts`.

## Consequences

- To change the standard wording, update all three places in one change, and
  update every recipe with it.
- A recipe whose declaration statement differs from the standard fails CI. A
  service-specific clause found in a paper form becomes a separate
  acknowledgement.
- Adding an acknowledgement to a form means adding a row to the spec's
  `ACKNOWLEDGEMENTS` table. Removing one means deleting its row, which is a
  deliberate act.
- The declaration step can now hold more than one element. Reviews and tooling
  that assumed 0041's "exactly one element" must allow extra
  `components/confirmation` acknowledgements, and nothing else.
- Forms that lost a clause when they moved to the standard stay on the
  standard until the MDA confirms a need. The clause then comes back as an
  acknowledgement (tracked on #2957).
