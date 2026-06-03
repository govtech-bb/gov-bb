import { resolveSubmissionOutcome } from "./submission-outcome";
import { FormSubmissionResponse } from "@forms/types";

const response = (
  status: string,
  meta?: FormSubmissionResponse["meta"],
): FormSubmissionResponse =>
  ({
    status,
    message: "",
    data: {
      id: "ref-001",
      submittedAt: "2026-05-22T00:00:00Z",
      formId: "test-form",
    },
    meta,
  }) as FormSubmissionResponse;

const base = {
  referenceNumber: "ref-001",
  date: "2026-05-22T00:00:00Z",
  serviceName: "test-form",
};

describe("resolveSubmissionOutcome", () => {
  it.each(["submitted", "success", "complete"])(
    "maps '%s' to a no-payment success state and success event",
    (status) => {
      expect(resolveSubmissionOutcome(response(status))).toEqual({
        subState: { ...base, submissionSuccess: true, hasPayment: false },
        event: { name: "form-submit-success" },
      });
    },
  );

  it.each(["processing", "draft"])(
    "maps '%s' to no state and no event",
    (status) => {
      expect(resolveSubmissionOutcome(response(status))).toEqual({});
    },
  );

  it("maps 'pending_payment' with deferred meta to a payment state and success event", () => {
    const outcome = resolveSubmissionOutcome(
      response("pending_payment", {
        deferred: {
          amount: 100,
          paymentUrl: "https://pay.example.com",
          paymentId: "pay-001",
          description: "Application fee",
        },
      }),
    );
    expect(outcome).toEqual({
      subState: {
        ...base,
        submissionSuccess: true,
        hasPayment: true,
        amount: "100",
        paymentUrl: "https://pay.example.com",
        paymentId: "pay-001",
        paymentDescription: "Application fee",
      },
      event: { name: "form-submit-success" },
    });
  });

  it("maps 'pending_payment' without deferred meta to a payment-init error (issue #318)", () => {
    const outcome = resolveSubmissionOutcome(response("pending_payment"));
    // No paymentUrl — that is what makes the confirmation step show the
    // payment-failure block (isSafePaymentUrl(undefined) is false). And no
    // success event: the citizen cannot pay on this path.
    expect(outcome).toEqual({
      subState: { ...base, submissionSuccess: true, hasPayment: true },
      event: { name: "form-submit-error", reason: "payment-init" },
    });
  });

  it.each(["failed", "error", "completely-unknown"])(
    "maps '%s' to a failed state and server error event",
    (status) => {
      expect(resolveSubmissionOutcome(response(status))).toEqual({
        subState: { ...base, submissionSuccess: false, hasPayment: false },
        event: { name: "form-submit-error", reason: "server" },
      });
    },
  );
});
