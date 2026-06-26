import type { Processor } from "@govtech-bb/form-types";
import type {
  SubmissionValues,
  SubmissionAuditTrail,
} from "../submissions.types";

/**
 * Shape of a message written to and read from the SQS processor queues.
 *
 * One message is enqueued per non-gating processor *entry* per submission.
 * `processorIndex` positions the single entry this message addresses within
 * `processors[]`; the consumer deserialises this and passes it back into the
 * processor as a SubmissionCreatedEvent.
 */
export interface SubmissionSqsMessage {
  submissionId: string;
  /** Human-readable reference code (e.g. "JPP-20260604-130732-9JZRZC").
   *  Optional so messages enqueued before this field was added still parse;
   *  consumers fall back to `submissionId` when absent. */
  referenceCode?: string;
  processorType: string;
  /** Position of the addressed entry within `processors[]`. */
  processorIndex: number;
  formId: string;
  /** Optional post-#1196 (version retired): absent → canonical recipe. */
  formVersion?: string;
  idempotencyKey: string;
  values: SubmissionValues;
  meta: SubmissionAuditTrail;
  processors: Processor[];
  enqueuedAt: string; // ISO-8601
}
