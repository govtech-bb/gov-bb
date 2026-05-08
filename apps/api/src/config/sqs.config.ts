import { registerAs } from "@nestjs/config";

export default registerAs("sqs", () => ({
  /** Set SQS_ENABLED=true to route non-gating processors through SQS.
   *  When false (default) the existing in-process EventEmitter path is used. */
  enabled: process.env.SQS_ENABLED === "true",

  /** AWS region — defaults to ca-central-1 (sandbox queue location) */
  region: process.env.SQS_REGION ?? "ca-central-1",

  /** Optional custom endpoint for LocalStack / integration tests */
  endpoint: process.env.SQS_ENDPOINT,

  /** Single shared queue URL.
   *  All processor types share this queue; the processorType field inside
   *  each message body determines which handler the consumer dispatches to.
   *
   *  Main:  modular-forms-submissions-sandbox   (120 s visibility, 4-day retention, 20 s long poll)
   *  DLQ:   modular-forms-submissions-dlq-sandbox (14-day retention, maxReceiveCount = 3)
   */
  queueUrl: process.env.SQS_QUEUE_URL ?? "",
}));
