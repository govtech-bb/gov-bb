import { FormSubmissionResponse, SubmissionState } from "../types";

type SubmissionEvent =
  | { name: "form-submit-success" }
  | { name: "form-submit-error"; reason: "server" | "payment-init" };

export interface SubmissionOutcome {
  /** State to commit, or undefined for statuses with no UI consequence. */
  subState?: SubmissionState;
  /** Analytics event to fire, or undefined for silent statuses. */
  event?: SubmissionEvent;
}

/**
 * Pure mapping from a submission response to what the UI should do about it:
 * the SubmissionState to commit and the analytics event to fire. Keeping this
 * out of the route component makes every status branch testable with plain
 * objects — no render or form-hook mocking required.
 */
export function resolveSubmissionOutcome(
  response: FormSubmissionResponse,
): SubmissionOutcome {
  const base = {
    // Prefer the human-readable referenceCode (e.g. "JPP-20260604-130732-9JZRZC")
    // returned by the API; fall back to the UUID `id` for older API deploys that
    // don't yet include it (see issue #791).
    referenceNumber: response.data.referenceCode ?? response.data.id,
    // `submittedAt` is null on pending_payment submissions (not finalised until
    // paid, #919); normalise to undefined so the optional `date` field and
    // formatDate() handle it cleanly.
    date: response.data.submittedAt ?? undefined,
    serviceName: response.data.formId,
  };

  // Drive the UI off the SUBMISSION status (`data.status`: submitted /
  // pending_payment / …). The API envelope `status` is always "success" for a
  // 2xx (ApiResponse.success), so the previous `switch (response.status)` sent
  // every payment form to the no-payment success branch — the confirmation
  // rendered "submission saved" with no EZ Pay redirect, dropping
  // `meta.deferred`. Fall back to the envelope status only if `data.status` is
  // absent (defensive for older/edge response shapes).
  switch (response.data.status ?? response.status) {
    case "submitted":
    case "success":
    case "complete":
      // No-payment forms return `submitted`; the backend never attaches
      // payment to these responses, so hasPayment is correctly false here.
      return {
        subState: { ...base, submissionSuccess: true, hasPayment: false },
        event: { name: "form-submit-success" },
      };

    case "processing":
      // An idempotency-key replay of an in-flight submission (HTTP 202,
      // wrapped in ApiResponse.success). The submission is genuinely in hand —
      // commit a state carrying the `processing` flag so the confirmation step
      // shows a neutral "we're processing your submission" panel with the
      // reference number, instead of leaving submissionState undefined and
      // letting form-renderer bounce the citizen to check-your-answers (#463).
      // Stay silent on analytics: this is a duplicate of an already-tracked
      // submit, so there is no new event to fire.
      return {
        subState: {
          ...base,
          processing: true,
          submissionSuccess: true,
          hasPayment: false,
        },
      };

    case "draft":
      // Intentionally silent: a saved draft is effectively unreachable from the
      // public submit flow (drafts come from a different path), so there is
      // nothing to confirm yet and nothing to report.
      return {};

    case "pending_payment": {
      const deferred = response.meta?.deferred;
      if (!deferred) {
        // Payment was expected but the gateway details are missing — commit
        // a payment-init error state (no paymentUrl) so the confirmation
        // step renders the payment-failure block with the reference number.
        // Not a success for analytics: the citizen cannot pay on this path.
        return {
          subState: { ...base, submissionSuccess: true, hasPayment: true },
          event: { name: "form-submit-error", reason: "payment-init" },
        };
      }
      return {
        subState: {
          ...base,
          submissionSuccess: true,
          hasPayment: true,
          amount: deferred.amount.toString(),
          paymentUrl: deferred.paymentUrl,
          paymentId: deferred.paymentId,
          paymentDescription: deferred.description,
        },
        event: { name: "form-submit-success" },
      };
    }

    case "failed":
    case "error":
    default:
      // Server reported failure (or sent a status we don't recognise) —
      // commit a failed state so the confirmation step shows the
      // "Something went wrong" panel with a retry, instead of leaving the
      // citizen frozen with no feedback.
      return {
        subState: { ...base, submissionSuccess: false, hasPayment: false },
        event: { name: "form-submit-error", reason: "server" },
      };
  }
}

/**
 * Fold an EzPay return outcome (the `?payment=` search param set by the API's
 * `/payments/ezpay/redirect` handler) into the submission state rehydrated from
 * session storage, so the confirmation step reflects the payment result:
 * - `success` → show the paid receipt (`paymentSuccess: true`).
 * - `failed`  → clear `paymentUrl` so the payment-failure panel renders instead
 *   of "Continue to payment".
 * Returns the state unchanged when there is nothing to apply. Pure — the real
 * payment outcome is authoritative server-side; this only drives display.
 */
export function applyPaymentReturn(
  state: SubmissionState,
  payment: "success" | "failed" | undefined,
): SubmissionState {
  if (payment === "success") return { ...state, paymentSuccess: true };
  if (payment === "failed")
    return { ...state, paymentSuccess: false, paymentUrl: undefined };
  return state;
}
