import { registerAs } from "@nestjs/config";

export default registerAs("email", () => ({
  // AWS region for the SES client. Falls back to the standard SDK env var
  // (AWS_DEFAULT_REGION) which ECS sets automatically from the task region.
  region:
    process.env.SES_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",

  // Optional SES endpoint override. Unset in every deployed environment, so
  // the SDK resolves the real AWS SES endpoint as before. In local dev it
  // points the client at aws-ses-v2-local (see docker-compose.yml), which
  // captures sends in a viewable inbox instead of delivering real mail.
  endpoint: process.env.SES_ENDPOINT,

  // Verified SES sender identity — must be verified in the AWS account.
  from: process.env.SES_FROM_ADDRESS ?? "noreply@gov.bb",

  // SES configuration set for bounce/complaint tracking via SNS/EventBridge.
  // Optional — omit to send without telemetry.
  configurationSet: process.env.SES_CONFIGURATION_SET,

  // Fallback recipient for the "config.*" recipient kind when no form_config
  // row resolves (e.g. sandbox, which has no rows). Keeps test/sandbox
  // submissions away from real MDA inboxes. Defaults to a shared test inbox.
  defaultRecipient: process.env.SES_DEFAULT_RECIPIENT ?? "testing@govtech.bb",

  // When true, a "config.*" recipient that resolves no MDA email is a hard
  // (retryable) failure instead of silently falling back to `defaultRecipient`.
  // Set true in PRODUCTION only (via IaC) so a real citizen submission can
  // never be quietly routed to a test inbox — the summer-camp incident where a
  // form went live before its MDA recipient was configured. Non-prod
  // (sandbox/staging/local, which have no form_config rows) keeps defaulting so
  // those environments stay usable. See EmailProcessor.resolveConfigRecipient.
  requireResolvedRecipient: process.env.MDA_REQUIRE_RECIPIENT === "true",

  // Recipient for the public site feedback form (apps/landing /feedback).
  // Set explicitly per environment rather than routed through the form_config
  // directory, so it can never silently fall back to a test inbox the way a
  // missing form_config row does (issue #1139).
  feedbackRecipient: process.env.FEEDBACK_RECIPIENT ?? "feedback@govtech.bb",

  // Public base URL of the forms site, where the citizen confirmation email's
  // coat-of-arms image is served (`/images/coat-of-arms.png`). Reuses
  // FORMS_BASE_URL (already set in deployed envs for the EzPay return redirect);
  // when unset (e.g. local dev) the email omits the image rather than emitting
  // a broken/relative src.
  assetBaseUrl: process.env.EMAIL_ASSET_BASE_URL ?? process.env.FORMS_BASE_URL,
}));
