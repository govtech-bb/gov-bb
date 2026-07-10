import { registerAs } from "@nestjs/config";

/**
 * Umami Cloud access for the scheduled analytics refresher. The API key lives
 * server-side (api env) and never reaches the browser. When the key or website
 * ids are unset the refresher is disabled (logged + skipped) — local/dev and
 * environments without analytics simply serve an empty report.
 */
export default registerAs("umami", () => ({
  apiKey: process.env.UMAMI_API_KEY ?? "",
  landingWebsiteId: process.env.UMAMI_LANDING_WEBSITE_ID ?? "",
  formsWebsiteId: process.env.UMAMI_FORMS_WEBSITE_ID ?? "",
  /** Optional API base override (defaults to Umami Cloud in the client). */
  apiUrl: process.env.UMAMI_API_URL || undefined,
  timezone: process.env.UMAMI_TIMEZONE ?? "America/Barbados",
  /** Session-crawl window + cap — kept modest for Umami's rate limit. */
  sessionDays: Number(process.env.UMAMI_SESSION_DAYS ?? 7),
  sessionMax: Number(process.env.UMAMI_SESSION_MAX ?? 500),
}));
