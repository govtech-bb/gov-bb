/**
 * Typed webhook failures so logs / metrics / DLQ alarms can distinguish a
 * misconfiguration a human must fix from a downstream outage that will clear on
 * its own. Both are thrown from the WebhookProcessor and routed to SQS
 * retry/DLQ by the submission-processor listener.
 */

/**
 * Permanent misconfiguration — a named env var isn't provisioned, neither
 * `endpoint` nor `url` is set, or `mapping.codeService` isn't a known service.
 * Retrying won't help; a var or recipe must be fixed.
 */
export class WebhookConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookConfigError";
  }
}

/**
 * Transient delivery failure — a non-2xx response, timeout, or network error
 * from the destination. Expected to clear once the destination recovers; the
 * DLQ can be redriven.
 */
export class WebhookDeliveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "WebhookDeliveryError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
