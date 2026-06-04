import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import sqsConfig from "../../../config/sqs.config";
import type { SubmissionCreatedEvent } from "../submissions.types";
import type { SubmissionSqsMessage } from "./submission-sqs-message.interface";

@Injectable()
export class SqsProducerService {
  private readonly logger = new Logger(SqsProducerService.name);
  private readonly client: SQSClient;

  constructor(
    @Inject(sqsConfig.KEY)
    private readonly config: ConfigType<typeof sqsConfig>,
  ) {
    this.client = new SQSClient({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    });
  }

  /**
   * Enqueue a single non-gating processor *entry* message onto the shared SQS
   * queue.
   *
   * All processor types share one queue. The `processorType` field inside the
   * message body tells the consumer which handler to dispatch to;
   * `processorIndex` tells it which entry within `processors[]` to act on.
   *
   * @param event          The full SubmissionCreatedEvent to hydrate the worker.
   * @param processorType  e.g. "email", "spreadsheet", "opencrvs".
   * @param processorIndex Position of the addressed entry within `processors[]`.
   */
  async enqueue(
    event: SubmissionCreatedEvent,
    processorType: string,
    processorIndex: number,
  ): Promise<void> {
    const message: SubmissionSqsMessage = {
      submissionId: event.submissionId,
      processorType,
      processorIndex,
      formId: event.formId,
      formVersion: event.formVersion,
      idempotencyKey: event.idempotencyKey,
      values: event.values,
      meta: event.meta,
      processors: event.processors,
      enqueuedAt: new Date().toISOString(),
    };

    const result = await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.config.queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          submissionId: {
            DataType: "String",
            StringValue: event.submissionId,
          },
          processorType: {
            DataType: "String",
            StringValue: processorType,
          },
          processorIndex: {
            DataType: "Number",
            StringValue: String(processorIndex),
          },
        },
      }),
    );

    this.logger.log(
      `Enqueued processor="${processorType}" index=${processorIndex} submissionId="${event.submissionId}" messageId="${result.MessageId}"`,
    );
  }
}
