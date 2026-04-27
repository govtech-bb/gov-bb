import { Injectable, Logger } from "@nestjs/common";
import type { ISubmissionProcessor } from "./submission-processor.interface";
import type { SubmissionCreatedEvent } from "../submissions.types";

@Injectable()
export class EmailProcessor implements ISubmissionProcessor {
  readonly type = "email" as const;
  private readonly logger = new Logger(EmailProcessor.name);

  async process(payload: SubmissionCreatedEvent): Promise<void> {
    this.logger.log(`[email] submission ${payload.submissionId} — stub`);
  }
}
