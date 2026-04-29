import { Injectable, Logger } from "@nestjs/common";
import type { ISubmissionProcessor } from "./submission-processor.interface";
import type { SubmissionCreatedEvent } from "../submissions.types";

@Injectable()
export class OpencrvsProcessor implements ISubmissionProcessor {
  readonly type = "opencrvs" as const;
  private readonly logger = new Logger(OpencrvsProcessor.name);

  async process(payload: SubmissionCreatedEvent): Promise<void> {
    this.logger.log(`[opencrvs] submission ${payload.submissionId} — stub`);
  }
}
