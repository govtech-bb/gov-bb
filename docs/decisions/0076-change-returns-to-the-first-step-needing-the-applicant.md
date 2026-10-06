# 0076 — Change returns to the first step that needs the applicant, then the review

## Status

Accepted (2026-10-06)

## Context

On check-your-answers, each section has a **Change** link to its step. After
the applicant fixed their answer and pressed Continue, `completeAndContinue`
advanced to the next sequential step, so they were walked through every
remaining screen to get back to the review (#2812). The GOV.UK check-answers
pattern, and what applicants expect, is to come straight back.

Coming straight back is not always safe. A changed answer can leave a gap
somewhere else in the form:

- a `stepConditionalOn` can **reveal a step** the applicant has never seen;
- a cross-step `fieldConditionalOn` or `optionalIf` can make a field on an
  **already-completed** step required. Completion records can't see that, and
  check-your-answers hides empty fields, so the gap would be invisible until
  the API rejected the submission with a 422 (#2855).

Walking forward through the form happened to catch both cases, because each
step's validation ran on Continue. A plain "go back to the review" would have
lost that protection.

## Decision

The Change link adds `?returnTo=check-your-answers`. While that flag is in the
URL, Continue goes to `getReviewReturnStep`
(`apps/forms/src/lib/session-storage.ts`): the first step **before**
check-your-answers that is not completed, or whose visible fields no longer
pass validation; otherwise check-your-answers itself.

- **Validity is re-evaluated, not trusted from completion records.** The
  renderer judges a step with `collectStepErrorCodes(getVisibleFields(step,
  form), values)`, which is the same pure validator the analytics path uses,
  filtered by evaluated visibility (ADR 0040). `form.validateField` can't be
  used: TanStack only runs field validators for mounted fields.
- **Repeatable steps are trusted on completion alone.** `getVisibleFields`
  can't evaluate a repeat instance's conditions off-screen; it reads a render
  flag that is stale for an instance that isn't mounted. The result was a
  hidden required field that looked empty, which pulled the applicant back to
  a finished repeated step (caught by the e2e test on the master form).
  Repeatable steps are still revisited when they are incomplete.
- **The scan stops at the review.** Continue on the review marks it
  completed, so "first incomplete step" would carry an applicant who came back
  from the declaration on to the declaration.
- **Only a step before the review returns.** On the review or the
  declaration, Continue carries on as normal even if a stray `returnTo` is
  in the URL. Otherwise a submit, which clears completion records first,
  would send the applicant to an empty step 1.
- **The step just completed isn't re-judged.** It has just passed the
  on-screen validators. A second opinion that disagreed would bounce the
  applicant back onto it every time they pressed Continue.
- **Removing a repeat instance forgets its completion.** Instance ids are
  reused by count, so a stale record would make a re-added, empty instance
  look done.
- **The flag lasts until the review.** It rides along through each step that
  needs the applicant, including Previous and guard redirects, and is dropped
  whenever any navigation lands on check-your-answers.
- **The flag is a closed value.** The search schema accepts only
  `check-your-answers` and drops anything else (`.catch(undefined)`), so a
  stale or hand-edited link becomes a normal journey, not an error.

## Consequences

- Every form gets this behaviour, and no recipe changes are needed.
- A step that was hidden and then shown again keeps its answers
  (keep-but-hide, ADR 0040). If those answers are still valid, the applicant
  is not sent back to it.
- On Continue during a change, every visible field before the review is
  validated. These are synchronous validators over at most a few hundred
  fields, and they run only while the flag is set.
- The API validation from #2855 remains the backstop. This decision is about
  the applicant not reaching it.
- **Known gap:** a cross-step condition that newly requires a field on an
  already-completed *repeatable* step is not caught on the client; the API's
  422 still catches it. Closing the gap needs per-instance visibility
  evaluation that handles shared fields (#2932). Once that lands, remove the
  repeatable carve-out from `isStepValid` in `form-renderer.tsx`.
