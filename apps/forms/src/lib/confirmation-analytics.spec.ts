import { describe, it, expect } from "vitest";
import {
  confirmationOutcome,
  paymentReturnOutcome,
} from "./confirmation-analytics";
import { SubmissionState } from "@forms/types";

const base: SubmissionState = {
  hasPayment: false,
  serviceName: "test-form",
  submissionSuccess: true,
  referenceNumber: "REF-1",
};

describe("confirmationOutcome", () => {
  it("returns 'failed' when the submission failed", () => {
    expect(confirmationOutcome({ ...base, submissionSuccess: false })).toBe(
      "failed",
    );
  });

  it("returns 'processing' for an in-flight replay", () => {
    expect(confirmationOutcome({ ...base, processing: true })).toBe(
      "processing",
    );
  });

  it("returns 'success' for a saved non-payment submission", () => {
    expect(confirmationOutcome(base)).toBe("success");
  });

  it("returns 'payment-pending' for a payment form awaiting payment", () => {
    expect(
      confirmationOutcome({
        ...base,
        hasPayment: true,
        paymentUrl: "https://ezpay/x",
      }),
    ).toBe("payment-pending");
  });

  it("returns 'paid' after a successful EzPay return", () => {
    expect(
      confirmationOutcome({ ...base, hasPayment: true, paymentSuccess: true }),
    ).toBe("paid");
  });

  it("returns 'payment-failed' after a failed EzPay return", () => {
    expect(
      confirmationOutcome({ ...base, hasPayment: true, paymentSuccess: false }),
    ).toBe("payment-failed");
  });
});

describe("paymentReturnOutcome", () => {
  it("is null when the citizen has not returned from payment", () => {
    expect(paymentReturnOutcome(base)).toBeNull();
    expect(
      paymentReturnOutcome({ ...base, hasPayment: true, paymentUrl: "x" }),
    ).toBeNull();
  });

  it("maps paymentSuccess true/false to success/failed", () => {
    expect(paymentReturnOutcome({ ...base, paymentSuccess: true })).toBe(
      "success",
    );
    expect(paymentReturnOutcome({ ...base, paymentSuccess: false })).toBe(
      "failed",
    );
  });
});
