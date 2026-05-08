import { Inject, Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { ConfigType } from "@nestjs/config";
import { ExpressionsService } from "../../expressions/expressions.service";
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
    private readonly expressions: ExpressionsService,
  ) {}

  @OnEvent("submission.created", { async: true })
  async handleSubmissionCreated(
    payload: SubmissionCreatedEvent,
  ): Promise<void> {
    let resolvedPayload: SubmissionCreatedEvent;
    try {
      resolvedPayload = {
        ...payload,
        processors: this.expressions.resolveProcessors(payload.processors, {
          values: payload.values,
          meta: payload.meta as unknown as Record<string, unknown>,
          submission: {
            id: payload.submissionId,
            formId: payload.formId,
            idempotencyKey: payload.idempotencyKey,
          },
        }),
      };
    } catch (err) {
      this.logger.error(
        `Failed to resolve processors for submission ${payload.submissionId} — non-gating dispatch skipped`,
        err,
      );
      return;
    }

    const { nonGating } = this.processorFactory.resolveSplit(
      resolvedPayload.processors,
    );

    for (const processor of nonGating) {
      if (this.sqsConf.enabled) {
        /* SQS path — enqueue for durable async processing with automatic retry and DLQ. */
        try {
          await this.sqsProducer.enqueue(resolvedPayload, processor.type);
        } catch (err) {
          this.logger.error(
            `Failed to enqueue processor="${processor.type}" for submissionId="${payload.submissionId}"`,
            err,
          );
        }
      } else {
        /* Direct path (fallback) — in-process execution. */
        try {
          await processor.process(resolvedPayload);
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
