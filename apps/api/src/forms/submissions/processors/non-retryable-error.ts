/**
 * A processor failure that will never succeed on retry — a configuration error
 * (e.g. an unresolvable email recipient), not a transient one.
 *
 * The SQS consumer treats this specially: it logs the failure (so it's surfaced)
 * and deletes the message instead of leaving it to retry into the DLQ. A
 * plain `Error` keeps the default behaviour — retried by SQS, then DLQ — which is
 * correct for transient failures (SES down, DB unreachable, network blips).
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}
