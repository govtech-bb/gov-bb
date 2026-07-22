/**
 * Permanent webhook misconfiguration — a mapped (case-management) webhook whose
 * MDA destination can't be resolved: the form has no ministry key (unmapped
 * MDA), or the key has no valid entry in `MDA_WEBHOOK_DESTINATIONS`
 * (#1920/#2020). Retrying won't help; a `form_config` ministry key or the JSON
 * secret must be fixed. Thrown from WebhookProcessor and routed to SQS
 * retry/DLQ by the submission-processor listener, so the gap is visible rather
 * than a form silently never syncing.
 */
export class WebhookConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookConfigError";
  }
}
