# Standard declaration: review fixes on #2980

2026-10-09 · Forms · #2957, #2980, #2992

## Context

#2980 moved 75 recipes to the standard declaration (ADR 0077). The review asked
for the guides and example contract to show it, for the spec to find every
declaration step rather than every `declaration-confirmed` field, and for each
form's acknowledgements to be pinned as a list.

## What we did

- `declaration-wording.spec.ts` now finds steps by `stepId`. It requires
  exactly one declaration step per recipe. It rejects any element that isn't
  the standard checkbox or a listed acknowledgement, and it fails when an
  exemption names a form that no longer exists.
- Nine more recipes moved to the standard. Four were empty stubs.
  `national-summer-camp-2025-registration` keeps its camp rules as a
  `camp-rules-agreed` acknowledgement.
- Four legacy elements came off declaration steps. `camp-rules` and
  `declaration-date` were removed. The CSEC-style `important-notices` moved to
  the step before.
- The example contract, `FORM-CREATION-GUIDE.md`, `FORMS.md`, the AI prompt and
  the guardrails doc now point at the standard.

## Why we did it that way

- **`national-id-application` is exempt, not migrated.** It uses the shared
  `blocks/applicant-declaration` block. Fixing it properly means deciding
  whether that block carries the standard wording, which also changes the
  builder palette. That decision is #2992.
- **The four legacy elements were removed or moved, not allow-listed.** An
  allow-list would have contradicted ADR 0077's "nothing else on the step".
  `camp-rules` (hidden, required textarea) and `declaration-date` (hidden date)
  had no processor or smoke references and collected nothing from the citizen,
  so they were deleted. The notices are visible content, so they moved instead
  of being dropped.
- **The AI prompt keeps the `blocks/applicant-declaration` row, reworded to
  "Never for the declaration step".** `system-prompt.spec.ts` requires the
  prompt to list every registry block. Deleting the row would have failed that
  test.
- **`driver-licence-renewal` and `exit-survey` have no declaration step on
  purpose.** One is a stub with no processors and the other is a survey. They
  are listed in `NO_DECLARATION` so a form that silently loses its step fails.
- **`apply-for-swimming-pool-licence` is exempt.** #2872 merged mid-review with
  Environmental Health's "Your agreement" step, which has full name and date
  fields. That contradicts ADR 0077, but it was an explicit content-review
  request, so the merge took main's version and exempted the form until #2856
  B12 settles the standard EH agreement.

## Open questions

- Can the two summer-camp "the information may be checked" acknowledgements
  stay? That's for the content designer. ADR 0077 says generic verification
  consent doesn't qualify.
- `statement-of-travelling-form`'s "Important notices" are CXC exam
  registration text. They look copied from the CSEC form.
- The live smoke for `duties-performed-exam-claim` ticks a checkbox that
  sandbox won't have until this merges.
