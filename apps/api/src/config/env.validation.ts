import * as Joi from "joi";

const productionCorsOrigin = Joi.string()
  .required()
  .custom((value: string, helpers) => {
    const origins = value.split(",").map((o: string) => o.trim());
    for (const origin of origins) {
      if (origin === "*" || /localhost|127\.0\.0\.1/i.test(origin)) {
        return helpers.error("cors.unsafe", { value: origin });
      }
    }
    return value;
  })
  .messages({
    "cors.unsafe":
      '"CORS_ORIGIN" must not contain {{#value}} when NODE_ENV=production',
  });

export const envValidationSchema = Joi.object({
  // App
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  API_PORT: Joi.number().default(3001),
  CORS_ORIGIN: Joi.alternatives().conditional("NODE_ENV", {
    is: "production",
    then: productionCorsOrigin,
    otherwise: Joi.string().default("http://localhost:3000"),
  }),

  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  DB_SSL_CA: Joi.string().optional(),

  // OpenTelemetry (optional — telemetry is disabled if either is unset)
  OTEL_SERVICE_NAME: Joi.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().optional(),

  // SES (optional — required only when forms use the email processor)
  SES_REGION: Joi.string().optional(),
  SES_FROM_ADDRESS: Joi.string().default("noreply@gov.bb"),
  SES_CONFIGURATION_SET: Joi.string().optional(),
  // Fallback recipient for the "config.*" recipient kind when no form_config
  // row resolves (e.g. sandbox). Defaults to a shared test inbox so sandbox
  // never emails a real MDA.
  SES_DEFAULT_RECIPIENT: Joi.string().default("testing@govtech.bb"),

  // Recipient for the public site feedback form (apps/landing /feedback).
  // Explicit per-environment address, not routed through form_config (#1139).
  FEEDBACK_RECIPIENT: Joi.string().default("feedback@govtech.bb"),

  // Spreadsheet export (optional — defaults to <cwd>/exports)
  SPREADSHEET_EXPORT_DIR: Joi.string().optional(),

  // SQS (optional — required only when SQS_ENABLED=true)
  // Single shared queue; processor type is carried inside each message body.
  //   Main: modular-forms-submissions-sandbox
  //   DLQ:  modular-forms-submissions-dlq-sandbox  (auto-routed after 3 failures)
  SQS_ENABLED: Joi.boolean().default(false),
  SQS_REGION: Joi.string().optional(),
  SQS_ENDPOINT: Joi.string().uri().optional(), // LocalStack / custom endpoint
  SQS_QUEUE_URL: Joi.string()
    .uri()
    .when("SQS_ENABLED", {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional().allow(""),
    }),

  // Public forms site origin the EzPay return redirect bounces the citizen to
  // after payment (e.g. https://forms.sandbox.alpha.gov.bb). Empty = fall back
  // to the first CORS_ORIGIN entry, which is the forms site on every deployed
  // env, so this only needs setting when the two ever diverge.
  FORMS_BASE_URL: Joi.string().uri().allow("").default(""),

  // EzPay (required only when forms use the payment processor)
  EZPAY_BASE_URL: Joi.string().uri().required(),
  EZPAY_DEPARTMENT_API_KEYS: Joi.string().required(),
  EZPAY_WEBHOOK_VERIFY_SIGNATURE: Joi.string()
    .valid("true", "false")
    .default("false"),
  EZPAY_WEBHOOK_SECRET: Joi.string().when("EZPAY_WEBHOOK_VERIFY_SIGNATURE", {
    is: "true",
    then: Joi.required(),
    otherwise: Joi.string().optional().allow(""),
  }),

  // Outbound case-management webhook (youth-opportunity submissions). When a
  // youth-opportunity form is submitted, the backend posts to
  // `${WEBHOOK_URL}/api/webhooks/form-submitted` with the WEBHOOK_SECRET as the
  // X-API-Key header — the dispatch the frontend used to do. An empty WEBHOOK_URL
  // disables dispatch (logged + skipped), matching the old frontend behavior.
  WEBHOOK_URL: Joi.string().uri().allow("").default(""),
  WEBHOOK_SECRET: Joi.string().allow("").default(""),
  WEBHOOK_TIMEOUT_MS: Joi.number().integer().min(1000).default(10000),

  // Recipe preview (optional — empty disables the per-request preview escape hatch)
  RECIPE_PREVIEW_TOKEN: Joi.string().allow("").default(""),

  // Smoke submission (optional — empty disables the processor-drop escape hatch).
  // When set, a POST /submissions carrying a matching X-Smoke-Submission header
  // persists/validates but fires no processors — lets the post-deploy live
  // smoke matrix run without real emails/webhooks (#1252).
  SMOKE_SUBMISSION_TOKEN: Joi.string().allow("").default(""),

  // S3 file uploads (optional — required only when a form uses file fields)
  S3_BUCKET: Joi.string().allow("").default(""),
  S3_REGION: Joi.string().optional(),
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(false),
  UPLOAD_MAX_SIZE_BYTES: Joi.number().integer().min(1).default(10485760),
  UPLOAD_PRESIGN_TTL_SECONDS: Joi.number().integer().min(60).default(900),
  UPLOAD_READ_URL_TTL_SECONDS: Joi.number().integer().min(60).default(604800),
});
