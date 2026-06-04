import { registerAs } from "@nestjs/config";

export default registerAs("email", () => {
  // QA submission-notification target — NON-PROD ONLY. When set (on staging /
  // sandbox), every submission additionally emails this address so QA can
  // exercise the full submission → notification flow on ANY form without
  // touching per-form recipe config. It is purely ADDITIVE: a form's real
  // recipients are never replaced (unlike the removed EMAIL_OVERRIDE_RECIPIENT
  // redirect), and the send reuses EmailProcessor, so a failed QA notification
  // still throws → DLQ / error log rather than being silently masked.
  //
  // The gate is fail-safe toward production: it activates only when the
  // environment is EXPLICITLY marked non-prod. An unset/unknown APP_ENV (or
  // APP_ENV=production) yields `undefined`, so even if QA_MDA_NOTIFY leaks into
  // a prod task definition the hook stays structurally inert.
  const isNonProd =
    process.env.APP_ENV === "staging" ||
    process.env.APP_ENV === "sandbox" ||
    process.env.NODE_ENV === "development";

  return {
    // AWS region for the SES client. Falls back to the standard SDK env var
    // (AWS_DEFAULT_REGION) which ECS sets automatically from the task region.
    region:
      process.env.SES_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",

    // Verified SES sender identity — must be verified in the AWS account.
    from: process.env.SES_FROM_ADDRESS ?? "noreply@gov.bb",

    // SES configuration set for bounce/complaint tracking via SNS/EventBridge.
    // Optional — omit to send without telemetry.
    configurationSet: process.env.SES_CONFIGURATION_SET,

    // Comma-separated QA notification recipient(s). Undefined in production.
    // STAGING-ONLY QA_MDA_NOTIFY hook — preserved verbatim from staging; QA
    // testers depend on this for live MDA testing, so it must not change.
    qaNotifyRecipient: isNonProd ? process.env.QA_MDA_NOTIFY : undefined,

    // Fallback recipient for the "config.*" recipient kind when no form_config
    // row resolves (e.g. sandbox, which has no rows). Keeps test/sandbox
    // submissions away from real MDA inboxes. Defaults to a shared test inbox.
    defaultRecipient: process.env.SES_DEFAULT_RECIPIENT ?? "testing@govtech.bb",
  };
});
