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

    /* Per-entry dispatch — one message (or one direct invocation) per entry in
     * the frozen processors[] snapshot, addressed by its positional index. This
     * isolates retry/DLQ to the single entry that failed (issue #95). Indices
     * are the snapshot positions, so unregistered/gating entries are skipped
     * without compacting — keeping `${submissionId}:${index}` keys stable.
     * Gating processors (payment) run synchronously in submissions.service.ts
     * and are never enqueued here. */
    for (let index = 0; index < resolvedPayload.processors.length; index++) {
      const entry = resolvedPayload.processors[index];
      const handler = this.processorFactory.resolveByType(entry.type);

      if (!handler) {
        this.logger.warn(
          `No processor registered for type "${entry.type}" — skipping (submissionId="${payload.submissionId}", index=${index})`,
        );
        continue;
      }

      if (handler.gatesPipeline) continue;

      if (this.sqsConf.enabled) {
        /* SQS path — enqueue for durable async processing with automatic retry and DLQ. */
        try {
          await this.sqsProducer.enqueue(resolvedPayload, entry.type, index);
        } catch (err) {
          this.logger.error(
            `Failed to enqueue processor="${entry.type}" index=${index} for submissionId="${payload.submissionId}"`,
            err,
          );
        }
      } else {
        /* Direct path (fallback) — in-process execution of the indexed entry. */
        try {
          await handler.process({ ...resolvedPayload, processorIndex: index });
        } catch (err) {
          this.logger.error(
            `Processor "${entry.type}" index=${index} failed for submission ${payload.submissionId}`,
            err,
          );
        }
      }
    }
  }
}
