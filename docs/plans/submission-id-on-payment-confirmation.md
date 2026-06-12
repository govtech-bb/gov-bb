# Plan: Show the Submission ID on the payment confirmation page

## Goal

After submitting a form that requires payment (birth, death, marriage
certificates and any other payment form), the citizen sees their **Submission
ID** (the backend `referenceCode`, e.g. `GBC-20260611-104328-SX5YJY`) clearly on
the confirmation page — including the pre-payment "Complete your payment" card,
before they are redirected to EZ Pay. This gives the visible reference needed
for parity (F-39 / F-17): one value to tie the confirmation page to the
confirmation email, department email, payment, and CMS case.

## Background / root cause

The confirmation screen is rendered by the shared
`apps/forms/src/components/submission-confirmation.tsx`:

- **No-payment forms** (`hasPayment: false`) already render a prominent
  `form-page__reference` box with `Submission ID` + value.
- **Payment forms** (`hasPayment: true`) take a different branch. The Submission
  ID only appeared as an inline item **inside the payment-success block** — so
  on the pre-payment "Complete your payment" card the citizen first sees (and on
  the payment-failed block), **no Submission ID was shown anywhere**.

The backend already returns `referenceCode` on `POST /submissions`
(`status: pending_payment`), and `resolveSubmissionOutcome`
(`apps/forms/src/lib/submission-outcome.ts`) maps it onto
`submissionState.referenceNumber` for every payment state — so the value is
present client-side; it was simply not rendered on the pre-payment view.

This is a **frontend rendering gap, not a recipe/data problem** — no recipe
changes or new form versions are involved.

## Approach

Render the existing `form-page__reference` "Submission ID" box in the payment
branch, **right after the header**, so it appears in *all* payment states
(pre-payment card, payment-success, payment-failed). Reuse the exact markup and
CSS class already used by the no-payment branch — no new styles. Remove the now
redundant inline `Submission ID:` item from the payment-success block so the
value isn't rendered twice.

**Alternatives considered:**
- *Add the ID only to the pre-payment card* — more surgical, but leaves the
  failed state without a reference and splits the markup into two styles
  (box vs inline). Rejected for inconsistency.
- *Per-recipe `showSubmissionId` toggle* — unnecessary; the ID should always be
  visible on a payment confirmation. Adds config with no benefit. Rejected.
- *Gate the ID until after payment* — see Open question 1.

## Scope

- Add the `form-page__reference` Submission ID box to the payment branch
  (visible pre-payment, on success, and on failure).
- Remove the duplicate inline `Submission ID:` item from the payment-success
  block.
- Update/extend the component tests.

Applies to **all payment forms** via the shared component — which inherently
covers birth, death, and marriage certificates (the forms named in the issue).

## Files

- `apps/forms/src/components/submission-confirmation.tsx` — render the
  Submission ID box after the payment-branch header; drop the redundant inline
  item.
- `apps/forms/src/components/submission-confirmation.spec.tsx` — update the
  payment-success test (box label `Submission ID`, no colon); add tests for the
  pre-payment card and the payment-failed state both showing the box.

## Verify

- `pnpm exec nx run forms:test` green (including the new pre-payment /
  failed-state assertions).
- `pnpm exec nx run forms:build` green.
- Manual / smoke (optional, gateway permitting): submit get-birth-certificate
  end-to-end and confirm the Submission ID box shows on the "Complete your
  payment" page before redirect.

## Status

**Already implemented** on branch `fix-submission-id-on-payment-confirmation`
(off `sandbox`); `forms:test` (725 pass, 3 added/updated) and `forms:build` are
green. Not yet committed. This plan documents the decision retroactively.

## Open questions

1. **Timing — pre- vs post-payment.** The issue flagged that the reference *may*
   be intended to appear only after EZ Pay completes. Current implementation
   shows it **pre-payment** (on the "Complete your payment" card) per the issue's
   "Expected" section and the attached screenshot. **Not yet confirmed by the
   content/product owner** — if they want it hidden until after payment, gate the
   box on `paymentSuccess`.
2. **Failed-payment state.** Current implementation also shows the ID on the
   payment-failed block (the submission still exists and is quotable).
   Unconfirmed — easy to drop if undesired.
3. **Post-payment receipt** remains unverified/blocked in the original report
   (sandbox gateway requires card entry); out of scope for this change.
