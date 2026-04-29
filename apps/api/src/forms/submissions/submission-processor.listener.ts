import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { ProcessorFactory } from "./processors/processor-factory.service";
import type { SubmissionCreatedEvent } from "./submissions.types";

@Injectable()
export class SubmissionProcessorListener {
  private readonly logger = new Logger(SubmissionProcessorListener.name);

  constructor(private readonly processorFactory: ProcessorFactory) {}

  @OnEvent("submission.created", { async: true })
  async handleSubmissionCreated(
    payload: SubmissionCreatedEvent,
  ): Promise<void> {
    const resolved = this.processorFactory.resolve(payload.processors);

    for (const processor of resolved) {
      try {
        await processor.process(payload);
      } catch (err) {
        this.logger.error(
          `Processor "${processor.type}" failed for submission ${payload.submissionId}`,
          err,
        );
      }
    }
  }
}
