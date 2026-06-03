import type { FormSubmissionEntity } from "../../database/entities/form-submission.entity";
import type { Processor } from "@govtech-bb/form-types";

/**
 * Step values keyed by stepId. Repeatable steps are arrays of instance
 * objects; non-repeatable steps are a single instance object.
 */
export type SubmissionValues = Record<
  string,
  Record<string, unknown> | Array<Record<string, unknown>>
>;

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
export interface SubmissionAuditTrailV1 {
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
  pinnedFormVersion: string;
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
  formId: string;
  formVersion: string;
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
}

export interface SubmitDto {
  idempotencyKey: string;
  formId: string;
  formVersion: string;
  draftId?: string;
  values: SubmissionValues;
}

export type SubmitOutcome = "created" | "duplicate" | "in_progress";

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
