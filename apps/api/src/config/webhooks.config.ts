import { registerAs } from "@nestjs/config";

export default registerAs("webhooks", () => ({
  /**
   * Base URL of the external case-management system. The dispatcher posts to
   * `${url}/${path}`. Empty/unset disables dispatch (logged and skipped),
   * matching the old frontend behavior.
   */
  url: process.env.WEBHOOK_URL ?? "",

  /**
   * Path appended to `url` for the outbound POST. Defaults to the legacy
   * frontend-alpha endpoint; override per environment (e.g. `api/cases`).
   */
  path: process.env.WEBHOOK_PATH ?? "api/webhooks/form-submitted",

  /** Shared secret sent as the `X-API-Key` header on the outbound webhook. */
  secret: process.env.WEBHOOK_SECRET ?? "",

  /** Outbound request timeout in milliseconds. */
  timeoutMs: Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000),
}));
