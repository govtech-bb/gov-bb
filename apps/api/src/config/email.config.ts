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

  // Non-prod QA override: when set, the EmailProcessor redirects EVERY
  // outbound email (citizen confirmation and MDA/department notification) to
  // this single inbox instead of the configured recipient, and notes the
  // intended recipient in the subject. Lets QA observe all mail without
  // hitting real recipients or SES-verifying each one. Leave UNSET in prod.
  overrideRecipient: process.env.EMAIL_OVERRIDE_RECIPIENT,
}));
