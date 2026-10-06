# Change on Check your answers returns to the review (#2812)

## Context

On check-your-answers, Change sent the applicant to a step, and Continue then
walked them through every later step (`completeAndContinue` always went to
`steps[i + 1]`). The issue proposed a return flag that stops at "the first
newly revealed incomplete step".

## What we did

- `?returnTo=check-your-answers` set by the Change link (href and click), declared in
  `formSearchParamSchema` with `.catch(undefined)`.
- `getReviewReturnStep` (`lib/session-storage.ts`) picks the target; `useStepGuard`
  follows it; `FormRenderer` supplies `isStepValid`.
- `unmarkStepsCompleted` clears a removed repeat instance's completion.
- ADR 0076 records the rules; follow-up #2932 for repeatable visibility.

## Why we did it that way

- **Completion alone is not enough.** The issue's "first incomplete step" misses
  cross-step `fieldConditionalOn`/`optionalIf`, which can make a field on an
  already-completed step required. Walking the form used to catch that by
  accident. So the target is "incomplete *or* invalid". We rejected the narrower
  issue scope at triage for that reason.
- **Validity reuses `collectStepErrorCodes(getVisibleFields(...))`.** We didn't
  write a new validator. `form.validateField` silently does nothing useful for
  unmounted fields (TanStack falls back to form-level validation).
- **The scan stops at the review.** Continue on the review marks it completed,
  so "first incomplete" would carry an applicant back from the declaration on to
  the declaration.
- **The flag is cleared in `navigateToStepId`**, not only in Continue. Every route
  into the review (Previous from the declaration, guard redirects) ends the change
  journey the same way. Previous during a change keeps the flag, by agreement.
- **No "always jump to first incomplete, no flag" shortcut.** That would have
  changed how Previous then Continue behaves on a first pass for every form.

## What we almost got wrong

- **Repeatable steps.** The first version judged every step's validity. The
  local e2e run (CI doesn't run `navigation.spec.ts`) showed
  `step-5-financial-information~1` flagged with `fund-source-other` empty: for
  repeatables, `getVisibleFields` reads the `conditionallyHidden` render flag,
  which is stale off-screen. Repeatables are now judged on completion alone,
  with the user's agreement. The unit tests mocked the validators, so they could
  never have caught this.
- **Stale completion on reused instance ids.** Found by the independent review.
  "No" removed `~1` and purged its values but kept its completion, so a later
  "Yes" re-created a "completed" empty `~1`, and the return path skipped it.
  This was a regression on this branch, not a pre-existing bug.
- **A stray `returnTo` past the review.** A hand-edited `?step=declaration&returnTo=…`
  would, after submit (completion already cleared), send the applicant to an
  empty step 1. Now only steps before the review take the return path, and the
  step just completed isn't re-judged, so the two validators can't bounce the
  applicant in a loop.

## Open questions

- #2932: per-instance visibility evaluation for repeatable steps, including
  `sharedFields`. Until then, a cross-step condition that requires a field on a
  completed repeatable step is caught only by the API's 422.
- The submit-time 422 redirect doesn't set `returnTo`, and the Change href drops
  `?preview`/`?draft` (that one predates this work). Both are raised as separate tasks.
- An applicant sent to a now-invalid step sees its error only after pressing Continue.
