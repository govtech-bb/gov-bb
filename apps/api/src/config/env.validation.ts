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

  // OpenTelemetry (optional — telemetry is disabled if either is unset)
  OTEL_SERVICE_NAME: Joi.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().optional(),

  // SES (optional — required only when forms use the email processor)
  SES_REGION: Joi.string().optional(),
  SES_FROM_ADDRESS: Joi.string().default("noreply@gov.bb"),
  SES_CONFIGURATION_SET: Joi.string().optional(),

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
});
