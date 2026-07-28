import { registerAs } from "@nestjs/config";

/**
 * Config for the SES delivery-events consumer (SesEventConsumerService).
 *
 * SES publishes per-message delivery/bounce/complaint/reject events through a
 * configuration-set event destination → SNS → a dedicated SQS queue (see the
 * `ses-telemetry` module in alpha-infra). The consumer polls that queue and
 * reconciles `notification_log.delivery_status` from the SES MessageId.
 *
 * The consumer runs ONLY when a queue URL is provided. An empty/unset
 * SES_EVENTS_QUEUE_URL leaves it inert, so local dev and any env whose infra
 * hasn't been applied yet keep exactly their current behaviour — this is the
 * same "opt-in by config" gate the SES configuration set itself uses.
 */
export default registerAs("sesEvents", () => ({
  /** SES delivery-events queue URL. Empty string = consumer disabled. */
  queueUrl: process.env.SES_EVENTS_QUEUE_URL ?? "",

  /** AWS region for the SQS client — the queue lives in ca-central-1. */
  region:
    process.env.SES_EVENTS_REGION ?? process.env.SQS_REGION ?? "ca-central-1",

  /** Optional custom endpoint for LocalStack / integration tests. */
  endpoint: process.env.SQS_ENDPOINT,
}));
