import type { Processor } from "@govtech-bb/form-types";
import type {
  StepScopedValues,
  SubmissionAuditTrail,
} from "../submissions.types";

/**
 * Shape of a message written to and read from the SQS processor queues.
 *
 * One message is enqueued per non-gating processor per submission.
 * The consumer deserialises this and passes it back into the processor as
 * a SubmissionCreatedEvent.
 */
export interface SubmissionSqsMessage {
  submissionId: string;
  processorType: string;
  formId: string;
  formVersion: string;
  idempotencyKey: string;
  values: StepScopedValues;
  meta: SubmissionAuditTrail;
  processors: Processor[];
  enqueuedAt: string; // ISO-8601
}
