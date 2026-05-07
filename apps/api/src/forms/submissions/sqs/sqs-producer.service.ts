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
   * Enqueue a single non-gating processor message onto the shared SQS queue.
   *
   * All processor types share one queue. The `processorType` field inside the
   * message body tells the consumer which handler to dispatch to.
   *
   * @param event          The full SubmissionCreatedEvent to hydrate the worker.
   * @param processorType  e.g. "email", "spreadsheet", "opencrvs".
   */
  async enqueue(
    event: SubmissionCreatedEvent,
    processorType: string,
  ): Promise<void> {
    const message: SubmissionSqsMessage = {
      submissionId: event.submissionId,
      processorType,
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
        },
      }),
    );

    this.logger.log(
      `Enqueued processor="${processorType}" submissionId="${event.submissionId}" messageId="${result.MessageId}"`,
    );
  }
}
