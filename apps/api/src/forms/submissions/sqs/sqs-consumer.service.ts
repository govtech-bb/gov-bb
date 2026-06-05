import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
  MessageSystemAttributeName,
} from "@aws-sdk/client-sqs";
import sqsConfig from "../../../config/sqs.config";
import { ProcessorFactory } from "../processors/processor-factory.service";
import type { SubmissionCreatedEvent } from "../submissions.types";
import type { SubmissionSqsMessage } from "./submission-sqs-message.interface";

@Injectable()
export class SqsConsumerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SqsConsumerService.name);
  private readonly client: SQSClient;
  private running = false;

  constructor(
    @Inject(sqsConfig.KEY)
    private readonly config: ConfigType<typeof sqsConfig>,
    private readonly processorFactory: ProcessorFactory,
  ) {
    this.client = new SQSClient({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    });
  }

  onApplicationBootstrap(): void {
    if (!this.config.enabled) return;

    this.running = true;

    // Single shared queue — all processor types share one queue.
    // The processorType field inside each message body routes to the correct handler.
    void this.pollQueue(this.config.queueUrl);

    this.logger.log("SQS consumer started");
  }

  onApplicationShutdown(): void {
    this.running = false;
    this.logger.log("SQS consumer stopped");
  }

  /* Internal polling loop */

  private async pollQueue(queueUrl: string): Promise<void> {
    while (this.running) {
      try {
        const response = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20, // long polling — reduces empty receives by ~95 %
            // Request ApproximateReceiveCount so the consumer can detect retries
            MessageSystemAttributeNames: [
              MessageSystemAttributeName.ApproximateReceiveCount,
            ],
            MessageAttributeNames: ["All"],
          }),
        );

        if (!response?.Messages?.length) continue;

        await Promise.all(
          response.Messages.map((msg) => this.processMessage(queueUrl, msg)),
        );
      } catch (err) {
        this.logger.error(`Poll error on shared submissions queue`, err);
        // Brief back-off before retrying the poll so we don't hammer a broken endpoint.
        await this.sleep(5_000);
      }
    }
  }

  /* Single-message handler */

  async processMessage(queueUrl: string, message: Message): Promise<void> {
    const receiveCount = parseInt(
      // System attributes are returned in Message.Attributes keyed by MessageSystemAttributeName
      message.Attributes?.[
        MessageSystemAttributeName.ApproximateReceiveCount
      ] ?? "1",
      10,
    );

    // --- 1. Deserialise ---
    let payload: SubmissionSqsMessage;
    try {
      payload = JSON.parse(message.Body!) as SubmissionSqsMessage;
    } catch {
      this.logger.error(
        `Malformed SQS message messageId="${message.MessageId}" — deleting immediately`,
      );
      await this.deleteMessage(queueUrl, message.ReceiptHandle!);
      return;
    }

    // Defensive shape guard against corrupted or pre-v2 messages. We do
    // not re-validate against the contract here — that ran synchronously
    // before enqueue.
    if (
      typeof payload.values !== "object" ||
      payload.values === null ||
      Array.isArray(payload.values)
    ) {
      this.logger.error(
        `Malformed values shape in SQS message messageId="${message.MessageId}" — deleting`,
      );
      await this.deleteMessage(queueUrl, message.ReceiptHandle!);
      return;
    }

    // processorType + processorIndex are carried inside the message body — all
    // types share one queue, and the index positions the single entry this
    // message addresses within processors[].
    const { submissionId, processorType, processorIndex } = payload;

    // Per-entry dispatch guard. Every message enqueued under per-entry dispatch
    // carries an integer processorIndex addressing exactly one entry in
    // processors[]. A missing/non-array processors[], or a missing or
    // out-of-range index, means a pre-drain (legacy) message or a corrupted
    // body — delete it rather than let it loop to the DLQ, since no handler can
    // act on an entry that isn't there. The `!Array.isArray` check is first so
    // the `.length` reads below can't throw on a corrupted body (which, being
    // outside the execute try/catch, would otherwise crash-loop the poller).
    if (
      !Array.isArray(payload.processors) ||
      typeof processorIndex !== "number" ||
      !Number.isInteger(processorIndex) ||
      processorIndex < 0 ||
      processorIndex >= payload.processors.length
    ) {
      const processorCount = Array.isArray(payload.processors)
        ? payload.processors.length
        : "none";
      this.logger.error(
        `Missing or out-of-range processorIndex=${String(processorIndex)} ` +
          `(processors=${processorCount}) processor="${processorType}" ` +
          `submissionId="${submissionId}" messageId="${message.MessageId}" — deleting`,
      );
      await this.deleteMessage(queueUrl, message.ReceiptHandle!);
      return;
    }

    if (receiveCount > 1) {
      this.logger.warn(
        `Retry attempt #${receiveCount} processor="${processorType}" index=${processorIndex} submissionId="${submissionId}"`,
      );
    }

    this.logger.log(
      `Processing processor="${processorType}" index=${processorIndex} submissionId="${submissionId}" messageId="${message.MessageId}"`,
    );

    // --- 2. Resolve handler ---
    const processor = this.processorFactory.resolveByType(processorType);
    if (!processor) {
      this.logger.error(
        `No handler registered for processor="${processorType}" — deleting message to avoid infinite DLQ loop`,
      );
      await this.deleteMessage(queueUrl, message.ReceiptHandle!);
      return;
    }

    // --- 3. Execute ---
    try {
      await processor.process(this.toEvent(payload));

      // Success — remove from queue.
      await this.deleteMessage(queueUrl, message.ReceiptHandle!);
      this.logger.log(
        `Completed processor="${processorType}" index=${processorIndex} submissionId="${submissionId}"`,
      );
    } catch (err) {
      this.logger.error(
        `Processor="${processorType}" failed for submissionId="${submissionId}" ` +
          `(attempt ${receiveCount}) — message will be retried by SQS`,
        err,
      );
      // Do NOT delete — visibility timeout expires and SQS automatically
      // requeues up to maxReceiveCount times, then routes to the DLQ.
    }
  }

  /* Helpers */

  private async deleteMessage(
    queueUrl: string,
    receiptHandle: string,
  ): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  /** Reconstruct a SubmissionCreatedEvent from the queue message payload.
   *
   * `referenceCode` is optional on the wire (messages enqueued before this
   * field was added omit it). Fall back to `submissionId` so older in-flight
   * messages still produce a usable reference string downstream.
   */
  private toEvent(msg: SubmissionSqsMessage): SubmissionCreatedEvent {
    return {
      submissionId: msg.submissionId,
      referenceCode: msg.referenceCode ?? msg.submissionId,
      formId: msg.formId,
      formVersion: msg.formVersion,
      idempotencyKey: msg.idempotencyKey,
      values: msg.values,
      meta: msg.meta,
      processors: msg.processors,
      processorIndex: msg.processorIndex,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
