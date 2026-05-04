import * as Joi from "joi";

export const envValidationSchema = Joi.object({
  // App
  API_PORT: Joi.number().default(3001),

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

  // Email / SMTP (optional — required only when forms use the email processor)
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().optional().allow(""),
  SMTP_PASS: Joi.string().optional().allow(""),
  SMTP_FROM: Joi.string().default("noreply@gov.bb"),

  // Spreadsheet export (optional — defaults to <cwd>/exports)
  SPREADSHEET_EXPORT_DIR: Joi.string().optional(),

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
