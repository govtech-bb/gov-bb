import { registerAs } from "@nestjs/config";

export default registerAs("email", () => ({
  // AWS region for the SES client. Falls back to the standard SDK env var
  // (AWS_DEFAULT_REGION) which ECS sets automatically from the task region.
  region:
    process.env.SES_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",

  // Verified SES sender identity — must be verified in the AWS account.
  from: process.env.SES_FROM_ADDRESS ?? "noreply@gov.bb",

  // SES configuration set for bounce/complaint tracking via SNS/EventBridge.
  // Optional — omit to send without telemetry.
  configurationSet: process.env.SES_CONFIGURATION_SET,

  // Fallback recipient for the "config.*" recipient kind when no form_config
  // row resolves (e.g. sandbox, which has no rows). Keeps test/sandbox
  // submissions away from real MDA inboxes. Defaults to a shared test inbox.
  defaultRecipient: process.env.SES_DEFAULT_RECIPIENT ?? "testing@govtech.bb",

  // Recipient for the public site feedback form (apps/landing /feedback).
  // Set explicitly per environment rather than routed through the form_config
  // directory, so it can never silently fall back to a test inbox the way a
  // missing form_config row does (issue #1139).
  feedbackRecipient: process.env.FEEDBACK_RECIPIENT ?? "feedback@govtech.bb",
}));
