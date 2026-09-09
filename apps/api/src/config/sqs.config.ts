import { registerAs } from "@nestjs/config";

/** Default redrive `maxReceiveCount`. Single source shared with the env boot
 *  gate (env.validation.ts) so the default can't drift between the two. */
export const DEFAULT_MAX_RECEIVE_COUNT = 3;

/** Parse SQS_MAX_RECEIVE_COUNT the same way the boot gate validates it — an
 *  integer ≥ 1 — falling back to the default for unset/blank/invalid input, so
 *  the factory can never yield the `NaN`/`0` a bare `Number("")`/`Number(x)`
 *  would produce if the gate were ever bypassed. */
export function parseMaxReceiveCount(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1
    ? parsed
    : DEFAULT_MAX_RECEIVE_COUNT;
}

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

  /** Mirrors the queue's AWS-side redrive `maxReceiveCount` (default 3). The
   *  consumer uses it to detect the terminal attempt — a retryable failure at
   *  this receive count is the one that routes the message to the DLQ, so it's
   *  where the operator Slack alert fires (#2168). Keep in sync with the infra. */
  maxReceiveCount: parseMaxReceiveCount(process.env.SQS_MAX_RECEIVE_COUNT),
}));
