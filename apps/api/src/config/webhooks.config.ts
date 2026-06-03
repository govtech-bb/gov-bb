import { registerAs } from "@nestjs/config";

export default registerAs("webhooks", () => ({
  /**
   * Base URL of the external case-management system. The dispatcher posts to
   * `${url}/api/webhooks/form-submitted`, mirroring frontend-alpha. Empty/unset
   * disables dispatch (logged and skipped), matching the old frontend behavior.
   */
  url: process.env.WEBHOOK_URL ?? "",

  /** Shared secret sent as the `X-API-Key` header on the outbound webhook. */
  secret: process.env.WEBHOOK_SECRET ?? "",

  /** Outbound request timeout in milliseconds. */
  timeoutMs: Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000),
}));
