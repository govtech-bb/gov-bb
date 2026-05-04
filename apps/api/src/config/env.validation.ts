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

  // SES (optional — required only when forms use the email processor)
  SES_REGION: Joi.string().optional(),
  SES_FROM_ADDRESS: Joi.string().default("noreply@gov.bb"),
  SES_CONFIGURATION_SET: Joi.string().optional(),

  // Spreadsheet export (optional — defaults to <cwd>/exports)
  SPREADSHEET_EXPORT_DIR: Joi.string().optional(),
});
