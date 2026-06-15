# Feedback declaration hidden from the notification email

## Context

The in-chat `chat-feedback` form's declaration is auto-confirmed by the chat
(ADR 0049): the recipe requires it and the form-builder regenerates it on every
republish, but the user never sees or confirms it — the chat seeds the
`["confirmed"]` value at the submission boundary purely so the forms API's
required-check passes.

That seeding has a side effect downstream. The MDA feedback notification email
is built by `EmailBodyBuilder` (apps/api), which renders one section per active
step from the submitted values — so it surfaced a "Declaration: I confirm" row.
That row is misleading: it asserts a confirmation the user never actually saw.

## What we did

Added a per-form `SUPPRESSED_STEPS` map to `EmailBodyBuilder` and a single
`.filter` in `build()` that drops the `declaration` step from the email for
`chat-feedback`. Test coverage asserts the section is gone for the feedback form
and **still present for a real form** (`get-birth-certificate`).

## Why we did it that way

**Scoped per formId, not global.** A real application's declaration row in the
MDA email is a legitimate audit record that the applicant confirmed it — dropping
it for every form is a product/legal decision, not ours to make unprompted. So
the suppression is keyed by formId, with `chat-feedback` the only entry. This
mirrors the per-form scoping the chat-side auto-confirm uses.

**Suppress the step, not the field.** Per ADR 0041 the declaration step holds
exactly the one confirmation field, so dropping the step is equivalent to
dropping the field and reads more clearly against the "this step is ceremony"
intent. (`applicant-extractor.ts` already treats `declaration` as a
non-content/audit step in the same spirit.)

**apps/api owns this independently.** The email is sent server-side from the
recipe + submitted values; there is no shared runtime with the chat, so the
suppression can't be inherited from the chat's auto-confirm config and is
declared locally in the builder. It's the same ADR 0049 principle —
auto-confirmed ceremony stays invisible — applied across the app boundary.

## Open questions

None. Pure backend rendering logic, unit-tested. If the product later wants
declarations out of *all* notification emails, the map generalises to a set of
formIds (or a global rule) without touching the call site.
