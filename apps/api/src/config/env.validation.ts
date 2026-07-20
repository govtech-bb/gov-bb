import { z } from "zod";

// Env validation for apps/api, migrated from Joi to Zod (#1422 / TECH-05) so all
// Node services share one validation library. Wired in app.module.ts via
// ConfigModule's `validate:` hook. This schema is a fail-fast boot gate: the
// `registerAs` config factories (config/*.config.ts) read `process.env`
// directly with their own defaults, so the schema's job is to ACCEPT/REJECT at
// boot exactly as the Joi version did — defaults/coercion here mirror Joi for
// fidelity, but the factories are the runtime source of truth.

// Joi `.required()` rejects empty strings; z.string() accepts "" — so required
// vars use .min(1) to keep that parity.
const requiredStr = () => z.string().min(1);

// Joi.boolean() default: accepts the booleans and the strings "true"/"false"
// (case-insensitive), rejects anything else. Reproduce that, then coerce to a
// real boolean with the given default when unset.
const boolFromEnv = (def: boolean) =>
  z
    .preprocess(
      (v) => (typeof v === "string" ? v.toLowerCase() : v),
      z.union([z.boolean(), z.enum(["true", "false"])]).default(def),
    )
    .transform((v) => (typeof v === "boolean" ? v : v === "true"));

// Joi.string().uri() with `.allow("")` → a valid URL or the empty string.
const urlOrEmpty = () => z.union([z.url(), z.literal("")]);

// Joi.number() rejects "" / whitespace; a bare z.coerce.number() would turn
// them into 0. Reject blank strings before coercion so the two unbounded ports
// keep Joi parity. (The .min()-bounded numeric vars below already reject the
// coerced 0, so they don't need this.) Coercion otherwise matches Joi.number():
// 0, negatives and floats stay valid, non-numeric strings are rejected.
const portFromEnv = (def: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? NaN : v),
    z.coerce.number().default(def),
  );

// CORS_ORIGIN is unsafe in production if any comma-separated origin is a
// wildcard or points at localhost / loopback. Returns the offending origin (for
// the error message) or null.
const unsafeProdOrigin = (value: string): string | null => {
  for (const origin of value.split(",").map((o) => o.trim())) {
    if (origin === "*" || /localhost|127\.0\.0\.1/i.test(origin)) return origin;
  }
  return null;
};

const baseSchema = z
  .object({
    // App
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    API_PORT: portFromEnv(3001),
    // Conditional on NODE_ENV — required + safe in prod, defaulted otherwise.
    // The base field is optional here; the prod guard and the dev default are
    // applied in superRefine + transform below (Zod can't express a
    // sibling-conditional default inline the way Joi's alternatives() can).
    CORS_ORIGIN: z.string().optional(),

    // Database
    DB_HOST: requiredStr(),
    DB_PORT: portFromEnv(5432),
    DB_USERNAME: requiredStr(),
    DB_PASSWORD: requiredStr(),
    DB_NAME: requiredStr(),
    DB_SYNCHRONIZE: boolFromEnv(false),
    DB_LOGGING: boolFromEnv(false),
    DB_SSL_CA: z.string().optional(),

    // OpenTelemetry (optional — telemetry is disabled if either is unset)
    OTEL_SERVICE_NAME: z.string().optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),

    // SES (optional — required only when forms use the email processor)
    SES_REGION: z.string().optional(),
    SES_FROM_ADDRESS: z.string().default("noreply@gov.bb"),
    SES_CONFIGURATION_SET: z.string().optional(),
    // Fallback recipient for the "config.*" recipient kind when no form_config
    // row resolves (e.g. sandbox). Defaults to a shared test inbox so sandbox
    // never emails a real MDA.
    SES_DEFAULT_RECIPIENT: z.string().default("testing@govtech.bb"),

    // When true, a config.* recipient with no resolved MDA email is a hard
    // (retryable) failure instead of silently defaulting to SES_DEFAULT_RECIPIENT.
    // Set true in production only. See email.config.ts / EmailProcessor.
    MDA_REQUIRE_RECIPIENT: boolFromEnv(false),

    // Recipient for the public site feedback form (apps/landing /feedback).
    FEEDBACK_RECIPIENT: z.string().default("feedback@govtech.bb"),

    // Spreadsheet export (optional — defaults to <cwd>/exports in the factory)
    SPREADSHEET_EXPORT_DIR: z.string().optional(),

    // SQS (optional — SQS_QUEUE_URL required only when SQS_ENABLED=true)
    SQS_ENABLED: boolFromEnv(false),
    SQS_REGION: z.string().optional(),
    SQS_ENDPOINT: z.url().optional(), // LocalStack / custom endpoint
    SQS_QUEUE_URL: urlOrEmpty().optional(),

    // SES delivery-events queue (optional). When set, the SesEventConsumer
    // polls it to reconcile notification_log.delivery_status; empty = disabled.
    SES_EVENTS_QUEUE_URL: urlOrEmpty().optional(),
    SES_EVENTS_REGION: z.string().optional(),

    // Public forms site origin for the EzPay return redirect. Empty = fall back
    // to the first CORS_ORIGIN entry in the consuming code.
    FORMS_BASE_URL: urlOrEmpty().default(""),

    // EzPay (EZPAY_WEBHOOK_SECRET required only when verify-signature is on)
    EZPAY_BASE_URL: z.url(),
    EZPAY_DEPARTMENT_API_KEYS: requiredStr(),
    EZPAY_WEBHOOK_VERIFY_SIGNATURE: z.enum(["true", "false"]).default("false"),
    EZPAY_WEBHOOK_SECRET: z.string().optional(),

    // Outbound case-management webhook (youth-opportunity submissions).
    WEBHOOK_URL: urlOrEmpty().default(""),
    WEBHOOK_SECRET: z.string().default(""),
    WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),

    // Recipe preview (empty disables the per-request preview escape hatch)
    RECIPE_PREVIEW_TOKEN: z.string().default(""),

    // Parent domain for the cross-app shared `preview` cookie (#1646 Phase 3),
    // e.g. ".sandbox.alpha.gov.bb". When set, the cookie the API mints is scoped
    // to this domain so landing, forms and the API (all subdomain siblings)
    // share one grant. Unset → host-only cookie (local/Amplify-preview degrade
    // gracefully to per-app URL tokens).
    PREVIEW_COOKIE_DOMAIN: z.string().optional(),

    // Smoke submission (empty disables the processor-drop escape hatch, #1252)
    SMOKE_SUBMISSION_TOKEN: z.string().default(""),

    // Bearer token the AdminTokenGuard validates on the /admin/* endpoints
    // (kill switch + draft archive). OPTIONAL on purpose: the guard reads it
    // per-request, so an unset value only disables auth outside production (it
    // fails closed in prod). Never make this `.required()` — a boot-time
    // required var would crash-loop ECS on a missing value (ADR 0061).
    ARCHIVE_DRAFTS_TOKEN: z.string().optional(),

    // Dedicated token for the kill-switch admin surface (per-form disable).
    // When unset, the guard falls back to ARCHIVE_DRAFTS_TOKEN (same value
    // today) — set this var only to rotate the two credentials independently.
    // Never make this `.required()` either, for the same reason (ADR 0061).
    ADMIN_KILL_SWITCH_TOKEN: z.string().optional(),

    // Shared secret the observability console presents (Authorization: Bearer)
    // to GET /monitoring/notification-log — the read-only Delivery feed. Read
    // per-request by AdminTokenGuard, so it fails closed in prod (unset → 500,
    // never serves PII un-gated) and stays open in local dev. OPTIONAL on
    // purpose — never `.required()`, same ECS crash-loop reason as above
    // (ADR 0061).
    MONITORING_API_TOKEN: z.string().optional(),

    // S3 file uploads (optional — required only when a form uses file fields)
    S3_BUCKET: z.string().default(""),
    S3_REGION: z.string().optional(),
    S3_ENDPOINT: z.url().optional(),
    S3_FORCE_PATH_STYLE: boolFromEnv(false),
    UPLOAD_MAX_SIZE_BYTES: z.coerce.number().int().min(1).default(10485760),
    UPLOAD_PRESIGN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
    UPLOAD_READ_URL_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .default(604800),
  })
  // allowUnknown: true — config factories read unknown-but-valid vars straight
  // from process.env (AWS_REGION, AWS_DEFAULT_REGION, SES_ENDPOINT,
  // EMAIL_ASSET_BASE_URL, …); they must survive validation.
  .passthrough();

export const envValidationSchema = baseSchema
  .superRefine((env, ctx) => {
    // CORS_ORIGIN production guard (mirrors Joi's productionCorsOrigin).
    if (env.NODE_ENV === "production") {
      if (!env.CORS_ORIGIN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGIN"],
          message: '"CORS_ORIGIN" is required when NODE_ENV=production',
        });
      } else {
        const bad = unsafeProdOrigin(env.CORS_ORIGIN);
        if (bad) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["CORS_ORIGIN"],
            message: `"CORS_ORIGIN" must not contain ${bad} when NODE_ENV=production`,
          });
        }
      }
    }
    // SQS_QUEUE_URL required when SQS_ENABLED=true (Joi `.when`).
    if (env.SQS_ENABLED && !env.SQS_QUEUE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SQS_QUEUE_URL"],
        message: '"SQS_QUEUE_URL" is required when SQS_ENABLED=true',
      });
    }
    // EZPAY_WEBHOOK_SECRET required when signature verification is on (Joi `.when`).
    if (
      env.EZPAY_WEBHOOK_VERIFY_SIGNATURE === "true" &&
      !env.EZPAY_WEBHOOK_SECRET
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EZPAY_WEBHOOK_SECRET"],
        message:
          '"EZPAY_WEBHOOK_SECRET" is required when EZPAY_WEBHOOK_VERIFY_SIGNATURE=true',
      });
    }
  })
  .transform((env) =>
    // Joi defaulted CORS_ORIGIN to localhost outside production.
    env.NODE_ENV !== "production" && !env.CORS_ORIGIN
      ? { ...env, CORS_ORIGIN: "http://localhost:3000" }
      : env,
  );
