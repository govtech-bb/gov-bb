# Submission ID shown on the payment confirmation page

## Context

A QA report (reference parity, F-39 / F-17) found that after submitting a
**payment** form — birth, death, and marriage certificates — the confirmation
screen showed the "Complete your payment" card (Service, Amount, Continue to
payment → EZ Pay) but **no Submission ID anywhere**. The backend already returns
a well-formed `referenceCode` (e.g. `GBC-20260611-104328-SX5YJY`,
`status: pending_payment`) on `POST /submissions`; it simply wasn't rendered to
the citizen before they left for the gateway, so there was nothing on the page
to reconcile against the confirmation email, department email, payment, and CMS
case.

Diagnosed as a **frontend rendering gap**, not a data/recipe problem.
`resolveSubmissionOutcome` (`apps/forms/src/lib/submission-outcome.ts`) already
maps `referenceCode` onto `submissionState.referenceNumber` for every payment
state. The shared `submission-confirmation.tsx` renders a prominent
`form-page__reference` "Submission ID" box in the **no-payment** branch, but the
**payment** branch only surfaced the reference as an inline item *inside the
payment-success block* — so the pre-payment card (and the failed block) showed
nothing.

Worked on branch `fix-submission-id-on-payment-confirmation` (targets
`sandbox`).

## What we did

- `apps/forms/src/components/submission-confirmation.tsx` — render the existing
  `form-page__reference` "Submission ID" box near the top of the payment branch,
  gated on `referenceNumber && (paymentSuccess || isSafePaymentUrl(paymentUrl))`.
  Removed the now-redundant inline `Submission ID:` item from the payment-success
  block so the value isn't rendered twice.
- `apps/forms/src/components/submission-confirmation.spec.tsx` — updated the
  payment-success assertion to the box label (`Submission ID`, no colon); added a
  test that the box shows on the pre-payment "Complete your payment" card; added
  a test that it is **not** shown in the payment-failed block.

## Why it looks this way

- **Shared component, not per-recipe.** There is no per-form toggle for this and
  no reason to add one — a payment confirmation should always show the citizen's
  reference. The fix therefore covers *all* payment forms, which includes the
  three certificates named in the report.
- **The gating condition mirrors `trailingSections`.** Both are shown only when
  `paymentSuccess || isSafePaymentUrl(paymentUrl)`. So the Submission ID appears
  on the pre-payment card and after a successful payment, but **not** in the
  payment-init-failed / unsafe-URL state, where we deliberately show only a
  focused error panel. (This gating replaced an initial "show in every payment
  state" version — the failed-state test was flipped to match.)
- **Timing decision:** the reference is shown **before** payment (on the
  "Complete your payment" card), per the report's "Expected" section and the
  reference screenshot — not gated until after EZ Pay completes. Worth a
  content/product confirmation if that intent ever changes.
- No recipe changes or new form versions — purely a render fix.
