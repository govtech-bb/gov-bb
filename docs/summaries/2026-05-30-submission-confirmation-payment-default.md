# Submission-confirmation no longer defaults to "payment confirmed"

**Issue:** [#254](https://github.com/govtech-bb/gov-bb/issues/254)

## Context

A user completing a **free / no-payment** form could be shown a fake "Your
payment was successful" receipt — service name, `$100.00`, reference
`ABC123456789`, all fabricated. The fake receipt surfaced through three
independent paths, all rooted in the confirmation step rendering without a real
`submissionState`:

1. **Component fallback** — `submission-confirmation.tsx` substituted a
   hard-coded placeholder (`hasPayment:true`, `paymentSuccess:true`, `$100.00`,
   `ABC123456789`) whenever `submissionState` was `undefined`.
2. **Uncommitted `pending_payment`** — the route handler built `subState` but
   only called `setSubmissionState` when `response.meta.deferred` was present;
   without it, state stayed `undefined`.
3. **Lost React state on refresh** — `submissionState` is `useState`, so a
   refresh at the confirmation step cleared it while session-storage still
   marked prior steps complete, so the step guard allowed the step and the
   fallback won.

## What we did

Fixed all three paths — smallest change that removes the misleading default:

- **`submission-confirmation.tsx`**: dropped the placeholder fallback entirely;
  `return null` when `submissionState` is absent.
- **`routes/forms/$formId/index.tsx`**: the `pending_payment` branch now
  **always** commits state. With `meta.deferred` → the payment state (as
  before). Without it → a payment-init error state (`hasPayment:true`,
  `submissionSuccess:true`, **no** `paymentUrl`) so the existing "Payment could
  not be initiated" block renders with the reference number. Also tidied the
  misleading `// Get this value from response` comment on the `submitted`
  branch (no logic change — `hasPayment:false` is correct there).
- **`form-renderer.tsx`**: added a `useEffect` redirect guard — on
  `submission-confirmation` with `undefined` state, navigate back to
  `check-your-answers` (the same target `onTryAgain` uses). This covers the
  refresh case so the `null` render is never user-visible.
- Specs: replaced the test that pinned the buggy fallback with one asserting the
  component renders nothing payment-related; added coverage for the
  `pending_payment`-without-`deferred` → payment-init-error state (capturing the
  props the route commits to `FormRenderer`); added redirect / no-redirect cases
  in the renderer spec.

## Why we did it that way

- **`null` + redirect over a neutral "submission saved" empty state.** A
  confirmation with no reference number is itself slightly misleading. Rather
  than invent a benign-looking confirmation, render nothing and bounce the user
  to where they can re-submit. The component never renders without state in
  practice because the renderer redirects first.
- **Payment-init error state for missing `meta.deferred`, not a generic
  "saved".** When a payment was expected but the gateway details are missing,
  silently showing "submission saved" would hide that a payment is owed. The
  error block (with the reference number to quote to support) is the honest
  outcome.
- **Redirect-away over persisting `submissionState` to session-storage.**
  Surviving a refresh by persisting state is a larger change; redirect-away is
  sufficient for this bug and strictly better than the fake receipt.
- **Observing committed state in the route test via a prop-capturing
  `FormRenderer` mock.** `submissionState` is internal React state with no other
  externally observable effect; the existing route tests only asserted "does not
  throw". Capturing the prop the handler commits lets us assert the actual shape
  (`hasPayment:true`, no `paymentUrl`) rather than just non-crash.

## Scope boundary / follow-up

The `failed`/`error` and `processing`/`draft` branches also don't commit
`submissionState`, so with the new redirect guard they now bounce the user back
to check-your-answers rather than showing a dedicated error. Those are
pre-existing TODOs — redirect-away is strictly better than today's fake receipt,
but it isn't the right end state. Split into a follow-up:
[#463](https://github.com/govtech-bb/gov-bb/issues/463) (dedicated
error/processing UI).

## Verify

- Full `tsc -b`, `nx run-many -t build --exclude=landing`, and
  `nx run-many -t test` all green (forms: 651 passed, 1 skipped).
- Manual smoke (clicked in browser, all passed): no-payment form shows a real
  "submission saved" with no payment language; payment form shows the EZ Pay
  link; refresh on the confirmation step bounces to check-your-answers.
