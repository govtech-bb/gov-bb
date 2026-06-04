import { FormSubmissionResponse, SubmissionState } from "@forms/types";

export type SubmissionEvent =
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
    referenceNumber: response.data.id,
    date: response.data.submittedAt,
    serviceName: response.data.formId,
  };

  switch (response.status) {
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
    case "draft":
      // Intentionally silent: nothing to confirm yet, nothing to report.
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
