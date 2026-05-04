export const PAYMENT_COMPLETED_EVENT = "payment.completed";

export interface PaymentCompletedEvent {
  paymentId: string;
  submissionId: string;
  formId: string;
  status: "success" | "failed" | "mismatched";
}
