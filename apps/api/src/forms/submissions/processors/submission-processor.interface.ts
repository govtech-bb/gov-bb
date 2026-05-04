import type { Processor } from "@govtech-bb/form-types";
import type { SubmissionCreatedEvent } from "../submissions.types";

export const SUBMISSION_PROCESSORS = Symbol("SUBMISSION_PROCESSORS");

export type ProcessorOutput =
  | { kind: "completed" }
  | {
      kind: "deferred";
      data: {
        paymentUrl: string;
        paymentId: string;
        amount: number;
        description: string;
      };
    };

export interface ISubmissionProcessor {
  readonly type: Processor["type"];
  readonly gatesPipeline?: boolean;
  process(payload: SubmissionCreatedEvent): Promise<ProcessorOutput>;
}
