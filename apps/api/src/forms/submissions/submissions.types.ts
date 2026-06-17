import type { FormSubmissionEntity } from "@/database/entities/form-submission.entity";
import type { Processor, SubmissionValues } from "@govtech-bb/form-types";

// SubmissionValues now lives in @govtech-bb/form-types (the browser↔backend wire
// shape, single-sourced — #1399). Re-exported here so the many api consumers
// that import it from this module keep working.
export type { SubmissionValues };

export type FieldErrorMap = Record<string, string[]>;

export interface RepeatableStepErrors {
  _step?: string[];
  instances: FieldErrorMap[];
}

export type StepErrorBundle = FieldErrorMap | RepeatableStepErrors;
export type ValidationErrorBundle = Record<string, StepErrorBundle>;

export function isRepeatableStepErrors(
  v: StepErrorBundle,
): v is RepeatableStepErrors {
  return typeof v === "object" && v !== null && "instances" in v;
}

/** Legacy audit-trail shape — only emitted by rows persisted before v2. */
interface SubmissionAuditTrailV1 {
  schemaVersion: 1;
  pinnedFormVersion: string;
  draftId: string | null;
  activeStepIds: string[];
  hiddenStepIds: string[];
  activeFieldIds: Record<string, string[]>;
  hiddenFieldIds: Record<string, string[]>;
  visitedPages: number[];
  submittedAt: string;
}

/**
 * activeFieldIds / hiddenFieldIds are `string[][]` for repeatable steps
 * (one entry per instance), `string[]` otherwise.
 */
export interface SubmissionAuditTrailV2 {
  schemaVersion: 2;
  /** Null post-#1196 when a submission resolves the canonical recipe (no
   *  pinned version); a semver string for pre-cutover / draft-sourced rows. */
  pinnedFormVersion: string | null;
  draftId: string | null;
  activeStepIds: string[];
  hiddenStepIds: string[];
  activeFieldIds: Record<string, string[] | string[][]>;
  hiddenFieldIds: Record<string, string[] | string[][]>;
  visitedPages: number[];
  submittedAt: string;
}

export type SubmissionAuditTrail =
  | SubmissionAuditTrailV1
  | SubmissionAuditTrailV2;

export interface SubmissionCreatedEvent {
  submissionId: string;
  /** Human-readable reference code (e.g. "JPP-20260604-130732-9JZRZC").
   *  Prefer this over `submissionId` wherever a citizen-visible reference is
   *  displayed or emailed. */
  referenceCode: string;
  formId: string;
  /** Optional post-#1196 (version retired): absent → canonical recipe,
   *  present → pinned legacy version for an in-flight item. */
  formVersion?: string;
  idempotencyKey: string;
  processors: Processor[];
  values: SubmissionValues;
  meta: SubmissionAuditTrail;
  /**
   * Position of the single `processors[]` entry this event addresses. Set on
   * every dispatch path (SQS + direct) under per-entry dispatch — a handler
   * acts on exactly `processors[processorIndex]`. Optional only for the type:
   * the full snapshot stays on the payload so the index keeps
   * `${submissionId}:${index}` idempotency keys meaningful.
   */
  processorIndex?: number;
  /**
   * True when this submission came from the live smoke matrix (see
   * SubmitDto.isSmokeSubmission). Every `submission.created` consumer that
   * triggers a real side-effect must short-circuit on it — not just the
   * `processors[]`-driven dispatch. Carried here because some consumers (e.g.
   * YouthOpportunityWebhookListener) fire off `formId` and never read
   * `processors`, so an empty `processors[]` alone does not suppress them
   * (#1252).
   */
  isSmokeSubmission?: boolean;
  /**
   * Confirmed-payment details, present only on the event emitted after a
   * successful payment (PaymentWebhookService.fireDownstream). Surfaces the
   * amount received and EzPay transaction ID on the MDA/reviewer email.
   * Absent on non-payment submissions.
   */
  payment?: SubmissionPaymentSummary;
}

/** Confirmed-payment details carried on a post-payment `submission.created`
 * event and rendered on the MDA/reviewer confirmation email. */
export interface SubmissionPaymentSummary {
  /** Amount received, pre-formatted for display (e.g. "$50.00"). */
  amountReceived: string;
  /** EzPay transaction number. */
  transactionId: string;
}

/**
 * Emitted by the `PaymentProcessor` the moment an EzPay payment session is
 * freshly initiated for a submission (before the citizen pays). Drives the
 * pre-payment "payment required" email. Carries everything the email needs so
 * the listener never has to re-read the submission.
 */
export interface PaymentRequiredEvent {
  /** The citizen's email, resolved from the payment processor config. */
  customerEmail: string;
  formId: string;
  formVersion: string;
  referenceCode: string;
  submissionId: string;
  /** Amount due, in dollars. */
  amount: number;
  /** What the payment is for (the payment processor's description). */
  description: string;
  /** The EzPay-hosted payment page URL. */
  paymentUrl: string;
}

export interface SubmitDto {
  idempotencyKey: string;
  formId: string;
  /** Optional post-#1196: pre-cutover clients still send it; new ones omit it
   *  and the recipe resolves to the canonical file. */
  formVersion?: string;
  draftId?: string;
  values: SubmissionValues;
  /**
   * Set by the controller only when a request carries a valid
   * `X-Smoke-Submission` token (see SMOKE_SUBMISSION_TOKEN). When true the
   * service drops every processor at the choke point — the submission still
   * persists, validates, and gets a reference code, but no email / webhook /
   * payment-gating processor runs. Lets the post-deploy live smoke matrix
   * exercise the real submit path without firing real side-effects (#1252).
   */
  isSmokeSubmission?: boolean;
}

type SubmitOutcome = "created" | "duplicate" | "in_progress";

export interface SubmitResult {
  outcome: SubmitOutcome;
  data: FormSubmissionEntity;
  message: string;
  statusCode: number;
  deferred?: {
    paymentUrl: string;
    paymentId: string;
    amount: number;
    description: string;
  };
}
