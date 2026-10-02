import { SubmissionState } from "@forms/types";

/**
 * Pure derivation of the confirmation-page analytics fields from the committed
 * `SubmissionState` (#1955). Kept out of the renderer so every branch is
 * testable with plain objects.
 *
 * `outcome` values:
 * - `failed`          — submission itself failed (nothing saved)
 * - `processing`      — idempotency-key replay of an in-flight submit (#463)
 * - `success`         — non-payment submission saved
 * - `payment-pending` — payment form, awaiting payment (Continue to payment)
 * - `paid`            — returned from EzPay successfully
 * - `payment-failed`  — returned from EzPay unsuccessfully
 */
export function confirmationOutcome(state: SubmissionState): string {
  if (!state.submissionSuccess) return "failed";
  if (state.processing) return "processing";
  if (!state.hasPayment) return "success";
  if (state.paymentSuccess === true) return "paid";
  if (state.paymentSuccess === false) return "payment-failed";
  return "payment-pending";
}

/**
 * The EzPay return outcome, or `null` when the citizen has not returned from
 * payment. `paymentSuccess` is only ever set by `applyPaymentReturn` (folding in
 * the `?payment=` param), so its presence uniquely marks a return — a fresh
 * payment submission awaiting payment leaves it undefined.
 */
export function paymentReturnOutcome(
  state: SubmissionState,
): "success" | "failed" | null {
  if (state.paymentSuccess === true) return "success";
  if (state.paymentSuccess === false) return "failed";
  return null;
}
