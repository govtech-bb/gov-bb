import type { FormSubmissionEntity } from "../../database/entities/form-submission.entity";
import type { Processor } from "@govtech-bb/form-types";

export type StepScopedValues = Record<string, Record<string, unknown>>;

export interface SubmissionAuditTrail {
  schemaVersion: 1;
  pinnedFormVersion: string;
  draftId: string;
  activeStepIds: string[];
  hiddenStepIds: string[];
  activeFieldIds: Record<string, string[]>;
  hiddenFieldIds: Record<string, string[]>;
  visitedPages: number[];
  submittedAt: string;
}

export interface SubmissionCreatedEvent {
  submissionId: string;
  formId: string;
  formVersion: string;
  idempotencyKey: string;
  processors: Processor[];
  values: StepScopedValues;
  meta: SubmissionAuditTrail;
}

export interface SubmitDto {
  idempotencyKey: string;
  formId: string;
  formVersion: string;
  draftId: string;
  values: StepScopedValues;
}

export type SubmitOutcome = "created" | "duplicate" | "in_progress";

export interface SubmitResult {
  outcome: SubmitOutcome;
  data: FormSubmissionEntity;
  message: string;
  statusCode: number;
}
