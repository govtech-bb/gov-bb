import { z } from "zod";

// A literal "true" → boolean env flag (anything else, incl. unset, is false).
// Mirrors the existing `process.env.X === "true"` reads in db.ts exactly — note
// chat's boolFlag also accepts "1"; this one does not, so behaviour is unchanged.
const boolFlag = () =>
  z
    .string()
    .optional()
    .transform((v) => v === "true");

// Boot-time env schema for form_builder_api. Defaults MIRROR the current
// `process.env.X ?? default` reads scattered across the service (app.ts, db.ts,
// main.ts, ai/client.ts, routes/*, storage/*) so introducing the schema changes
// no runtime values — it only adds fail-fast validation. The read sites are left
// as-is (boot validates and throws; reads keep their inline defaults).
const envSchema = z
  .object({
    // Only "production" alters behaviour (the guard below); other values are
    // treated as non-prod, matching the existing `=== "production"` checks.
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3003),
    // Comma-separated allowed origins; `app.ts` splits on ",". Optional in dev
    // (falls back to "*"); required and non-wildcard in prod (see guard).
    CORS_ORIGIN: z.string().optional(),
    BUILDER_RATE_LIMIT: z.coerce.number().int().positive().default(120),
    // Admin token for /builder/* routes. auth.ts hard-fails (500) at request
    // time in prod when unset — promoted to a boot-time failure here.
    ADMIN_API_TOKEN: z.string().optional(),
    DB_HOST: z.string().default("localhost"),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_USERNAME: z.string().default("postgres"),
    DB_PASSWORD: z.string().default("postgres"),
    DB_NAME: z.string().default("modular_forms"),
    DB_SYNCHRONIZE: boolFlag(),
    DB_LOGGING: boolFlag(),
    // Bedrock model id for the AI converter; aliases expanded downstream.
    AI_MODEL: z
      .string()
      .default("global.anthropic.claude-haiku-4-5-20251001-v1:0"),
    AWS_REGION: z.string().default("ca-central-1"),
    // S3/Textract config — optional everywhere; the upload/textract paths guard
    // on S3_BUCKET themselves and are not exercised on every deploy.
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    // Forms API base URL for cross-checks; forms.ts has its own default.
    API_BASE_URL: z.string().optional(),
    // GitHub org for publish. publish.ts throws at request time when unset
    // (#1400) — promoted to a boot-time failure in prod here.
    GITHUB_ORG: z.string().optional(),
    PUBLISH_BASE_BRANCH: z.string().default("dev"),
    // Recipe-preview token forwarded to apps/api so the published-forms proxy
    // gets the authoring list (non-public forms + visibility, #1835). Optional
    // everywhere — never required at boot; when unset the proxy omits the
    // header and falls back to the public-only list (degraded, never a crash).
    RECIPE_PREVIEW_TOKEN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    // In production the lazy request-time gates must already hold at boot.
    if (!env.ADMIN_API_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ADMIN_API_TOKEN"],
        message: "ADMIN_API_TOKEN is required in production",
      });
    }
    if (!env.GITHUB_ORG) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GITHUB_ORG"],
        message: "GITHUB_ORG is required in production",
      });
    }
    if (
      !env.CORS_ORIGIN ||
      env.CORS_ORIGIN === "*" ||
      env.CORS_ORIGIN.includes("localhost")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message:
          "CORS_ORIGIN must be set to a non-wildcard, non-localhost origin in production",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

// Pure parse — used by tests with explicit inputs and by getEnv() at boot.
// Unknown keys (the rest of process.env) are stripped by z.object.
export const parseEnv = (source: NodeJS.ProcessEnv = process.env): Env =>
  envSchema.parse(source);

let cached: Env | undefined;

// Validate once at startup and cache. A thrown ZodError here is the fail-fast:
// the process exits before serving a request with missing/malformed config.
export const getEnv = (): Env => (cached ??= parseEnv());
