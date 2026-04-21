import * as Joi from 'joi';

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
});
