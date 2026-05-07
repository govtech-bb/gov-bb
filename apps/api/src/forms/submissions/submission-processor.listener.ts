import { Inject, Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { ConfigType } from "@nestjs/config";
import { ProcessorFactory } from "./processors/processor-factory.service";
import { SqsProducerService } from "./sqs/sqs-producer.service";
import sqsConfig from "../../config/sqs.config";
import type { SubmissionCreatedEvent } from "./submissions.types";

@Injectable()
export class SubmissionProcessorListener {
  private readonly logger = new Logger(SubmissionProcessorListener.name);

  constructor(
    private readonly processorFactory: ProcessorFactory,
    private readonly sqsProducer: SqsProducerService,
    @Inject(sqsConfig.KEY)
    private readonly sqsConf: ConfigType<typeof sqsConfig>,
  ) {}

  @OnEvent("submission.created", { async: true })
  async handleSubmissionCreated(
    payload: SubmissionCreatedEvent,
  ): Promise<void> {
    const { nonGating } = this.processorFactory.resolveSplit(
      payload.processors,
    );

    for (const processor of nonGating) {
      if (this.sqsConf.enabled) {
        // ── SQS path ────────────────────────────────────────────────────────
        // Enqueue for durable async processing with automatic retry and DLQ.
        try {
          await this.sqsProducer.enqueue(payload, processor.type);
        } catch (err) {
          this.logger.error(
            `Failed to enqueue processor="${processor.type}" for submissionId="${payload.submissionId}"`,
            err,
          );
        }
      } else {
        // ── Direct path (fallback) ───────────────────────────────────────────
        // In-process execution — used when SQS_ENABLED is false or unset.
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
}
