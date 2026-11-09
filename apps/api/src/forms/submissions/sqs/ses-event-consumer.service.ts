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
} from "@aws-sdk/client-sqs";
import sesEventsConfig from "@/config/ses-events.config";
import { NotificationDeliveryStatus } from "@/database/entities/notification-log.entity";
import { NotificationLogRepository } from "../notification-log.repository";
import { parseSesEvent } from "./ses-event.types";

/**
 * Polls the SES delivery-events SQS queue and reconciles SES delivery truth
 * (delivery / bounce / complaint / reject) onto notification_log rows, matched
 * by the SES MessageId stored in provider_message_id.
 *
 * This is a SIBLING of SqsConsumerService, deliberately NOT sharing the
 * submissions queue: SES events are a different message shape on a dedicated
 * queue (see the ses-telemetry module). The submissions consumer is untouched.
 *
 * Opt-in by config: runs only when SES_EVENTS_QUEUE_URL is set, so local dev
 * and any env whose infra isn't applied yet stay inert.
 */
@Injectable()
export class SesEventConsumerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SesEventConsumerService.name);
  private readonly client: SQSClient;
  private running = false;
  private loop?: Promise<void>;

  /** Bounds the shutdown drain so a stuck iteration can't block shutdown. Sits
   *  above the 20 s long-poll window with headroom. */
  private static readonly DRAIN_TIMEOUT_MS = 30_000;

  /** How long after the send an unmatched event is still treated as a race
   *  (see isPastRaceWindow). */
  static readonly UNMATCHED_GRACE_MS = 2 * 60_000;

  constructor(
    @Inject(sesEventsConfig.KEY)
    private readonly config: ConfigType<typeof sesEventsConfig>,
    private readonly notificationLog: NotificationLogRepository,
  ) {
    this.client = new SQSClient({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    });
  }

  onApplicationBootstrap(): void {
    // Empty queue URL = feature disabled (local dev / pre-infra envs).
    if (!this.config.queueUrl) {
      this.logger.log("SES event consumer disabled (no SES_EVENTS_QUEUE_URL)");
      return;
    }

    this.running = true;
    this.loop = this.pollQueue(this.config.queueUrl);
    this.logger.log("SES event consumer started");
  }

  async onApplicationShutdown(): Promise<void> {
    this.running = false;

    if (this.loop) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<false>((resolve) => {
        timer = setTimeout(
          () => resolve(false),
          SesEventConsumerService.DRAIN_TIMEOUT_MS,
        );
      });

      const drained = await Promise.race([this.loop.then(() => true), timeout]);
      clearTimeout(timer);

      if (!drained) {
        this.logger.warn(
          `SES event consumer drain timed out after ${SesEventConsumerService.DRAIN_TIMEOUT_MS} ms — ` +
            `in-flight messages left for SQS redelivery`,
        );
      }
    }

    this.client.destroy();
    this.logger.log("SES event consumer stopped");
  }

  private async pollQueue(queueUrl: string): Promise<void> {
    while (this.running) {
      try {
        const response = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20, // long polling
          }),
        );

        if (!response?.Messages?.length) continue;
        if (!this.running) break;

        await Promise.all(
          response.Messages.map((msg) => this.processMessage(queueUrl, msg)),
        );
      } catch (err) {
        this.logger.error("Poll error on SES events queue", err);
        await this.sleep(5_000);
      }
    }
  }

  async processMessage(queueUrl: string, message: Message): Promise<void> {
    const parsed = parseSesEvent(message.Body ?? "");

    // Unparseable body or an event type we don't track (Send/Open/Click/…):
    // nothing to reconcile, so drop it rather than let it churn to the DLQ.
    if (!parsed) {
      await this.deleteMessage(queueUrl, message.ReceiptHandle!);
      return;
    }

    try {
      const result = await this.notificationLog.reconcileDeliveryStatus(
        parsed.messageId,
        parsed.status,
      );

      if (result === "unmatched") {
        if (this.isPastRaceWindow(parsed.sentAt)) {
          // The email was sent long enough ago that its notification_log row
          // would exist by now if it was ever going to. So this event belongs
          // to an email that isn't tracked there: one of the API's other sends
          // (water alerts, feedback, ops alerts) or another app sending from
          // the same domain. Retrying can never match it and only fills the
          // DLQ, so drop it. Bad outcomes still log at warn level, so a bounce
          // on an untracked email stays visible in the logs.
          const line =
            `No notification_log row for SES messageId="${parsed.messageId}" ` +
            `(status=${parsed.status}, sent ${parsed.sentAt!.toISOString()}) — ` +
            `untracked email, discarding`;
          if (parsed.status === NotificationDeliveryStatus.DELIVERED) {
            this.logger.log(line);
          } else {
            this.logger.warn(line);
          }
          await this.deleteMessage(queueUrl, message.ReceiptHandle!);
          return;
        }

        // Inside the race window: the SES event may have outrun the
        // notification_log insert. Leave the message for SQS to redeliver
        // (visibility timeout), and it is matched or discarded on a later try.
        this.logger.warn(
          `No notification_log row for SES messageId="${parsed.messageId}" ` +
            `(status=${parsed.status}) — leaving for redelivery`,
        );
        return;
      }

      this.logger.log(
        `Reconciled delivery_status=${parsed.status} for messageId="${parsed.messageId}"`,
      );
      await this.deleteMessage(queueUrl, message.ReceiptHandle!);
    } catch (err) {
      // Transient DB error — do NOT delete; SQS redelivers after the visibility
      // timeout, then routes to the DLQ after maxReceiveCount.
      this.logger.error(
        `Failed to reconcile SES messageId="${parsed.messageId}" — will retry`,
        err,
      );
    }
  }

  /**
   * True once the email is old enough that a missing notification_log row
   * can't be the send-then-insert race. The row is written right after SES
   * accepts the send, so a couple of minutes is ample. It must stay well under
   * maxReceiveCount × visibility timeout on the queue (5 × 60 s in every env),
   * or unmatched events reach the DLQ before they are discarded. With no
   * timestamp we can't tell, so we keep the old retry behaviour.
   */
  private isPastRaceWindow(sentAt: Date | undefined): boolean {
    if (!sentAt) return false;
    return (
      Date.now() - sentAt.getTime() > SesEventConsumerService.UNMATCHED_GRACE_MS
    );
  }

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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
