import type { Processor } from "@govtech-bb/form-types";
import type { SubmissionCreatedEvent } from "../submissions.types";

export const SUBMISSION_PROCESSORS = Symbol("SUBMISSION_PROCESSORS");

export interface ISubmissionProcessor {
  readonly type: Processor["type"];
  process(payload: SubmissionCreatedEvent): Promise<void>;
}
