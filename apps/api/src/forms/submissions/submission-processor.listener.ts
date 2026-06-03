import { Inject, Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { ConfigType } from "@nestjs/config";
import { ExpressionsService } from "../../expressions/expressions.service";
import { ProcessorFactory } from "./processors/processor-factory.service";
import { SqsProducerService } from "./sqs/sqs-producer.service";
import sqsConfig from "../../config/sqs.config";
import emailConfig from "../../config/email.config";
import type { SubmissionCreatedEvent } from "./submissions.types";
import type { Processor } from "@govtech-bb/form-types";

@Injectable()
export class SubmissionProcessorListener {
  private readonly logger = new Logger(SubmissionProcessorListener.name);

  constructor(
    private readonly processorFactory: ProcessorFactory,
    private readonly sqsProducer: SqsProducerService,
    @Inject(sqsConfig.KEY)
    private readonly sqsConf: ConfigType<typeof sqsConfig>,
    private readonly expressions: ExpressionsService,
    @Inject(emailConfig.KEY)
    private readonly emailConf: ConfigType<typeof emailConfig>,
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

    // QA test scaffold (non-prod only): append a synthetic email entry per
    // configured QA recipient BEFORE the split, so every submission also
    // notifies the QA inbox(es) — even for forms that declare no recipient.
    // Done before resolveSplit so the synthetic entry materialises an email
    // handler on forms that otherwise have none.
    this.appendQaNotifyRecipients(resolvedPayload);

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

  /**
   * Non-prod QA scaffold. When `email.qaNotifyRecipient` is set (staging /
   * sandbox only — see email.config), append one synthetic `email` entry per
   * comma-separated address so the submission additionally notifies the QA
   * inbox(es). Purely additive: the form's own recipients are left untouched,
   * and the entry flows through the normal EmailProcessor (same template +
   * throw-on-failure), so a failed QA notification surfaces via DLQ / error
   * log rather than being masked. A no-op in production (config is undefined).
   */
  private appendQaNotifyRecipients(payload: SubmissionCreatedEvent): void {
    const raw = this.emailConf.qaNotifyRecipient;
    if (!raw) return;

    const recipients = raw
      .split(",")
      .map((address) => address.trim())
      .filter(Boolean);
    if (recipients.length === 0) return;

    for (const address of recipients) {
      payload.processors.push({
        type: "email",
        config: {
          recipientField: address,
          subject: `[QA] ${payload.formId} submission ${payload.submissionId}`,
        },
      } as Processor);
    }

    this.logger.log(
      `[qa-notify] Appended ${recipients.length} QA notification recipient(s) for submission ${payload.submissionId}`,
    );
  }
}
