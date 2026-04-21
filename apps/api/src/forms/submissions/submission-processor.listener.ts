import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import type { SubmissionCreatedEvent } from "./submissions.types";

@Injectable()
export class SubmissionProcessorListener {
  private readonly logger = new Logger(SubmissionProcessorListener.name);

  @OnEvent("submission.created", { async: true })
  async handleSubmissionCreated(
    payload: SubmissionCreatedEvent,
  ): Promise<void> {
    const { submissionId, processors } = payload;

    for (const processor of processors) {
      try {
        await this.dispatch(processor.type, payload);
      } catch (err) {
        this.logger.error(
          `Processor "${processor.type}" failed for submission ${submissionId}`,
          err,
        );
      }
    }
  }

  private async dispatch(
    type: string,
    payload: SubmissionCreatedEvent,
  ): Promise<void> {
    switch (type) {
      case "email":
        this.logger.log(`[email] submission ${payload.submissionId} — stub`);
        break;
      case "payment":
        this.logger.log(`[payment] submission ${payload.submissionId} — stub`);
        break;
      case "opencrvs":
        this.logger.log(`[opencrvs] submission ${payload.submissionId} — stub`);
        break;
      default:
        this.logger.warn(`Unknown processor type "${type}" — skipping`);
    }
  }
}
