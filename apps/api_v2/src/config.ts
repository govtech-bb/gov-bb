import { z } from "zod";
import { Redacted } from "./modules/redacted";
import { err, ok, type Result } from "./modules/result";

/** Explicit database settings, unwrapped only by the Postgres adapter. */
export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: Redacted<string>;
  readonly database: string;
  readonly production: boolean;
  readonly ca?: string;
}

/** Auth configuration shared only with the auth adapter and HTTP root. */
export interface AuthConfig {
  readonly apiOrigin: string;
  readonly editorOrigin: string;
  readonly secret: Redacted<string>;
  readonly githubClientId: string;
  readonly githubClientSecret: Redacted<string>;
}

/** The process's parsed settings; inner modules never read environment variables. */
export interface AppConfig {
  readonly port: number;
  readonly seed: boolean;
  readonly database: DatabaseConfig;
  readonly auth: AuthConfig;
  /**
   * Local development only: skip sign-in and run every editor request as a
   * fixed developer. Refused in production and unless the editor is local.
   */
  readonly authBypass: boolean;
}

/** Invalid startup settings, reporting field names but never supplied values. */
export class ConfigurationError extends Error {
  /** Stable failure tag for startup diagnostics. */
  readonly _tag = "ConfigurationError";
  /** Names of settings that need correction. */
  constructor(readonly fields: readonly string[]) {
    super(`Invalid configuration: ${fields.join(", ")}`);
  }
}

const origin = z
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.pathname === "/" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  })
  .transform((value) => new URL(value).origin);
const environment = z
  .object({
    NODE_ENV: z.string().optional(),
    PORT: z.coerce.number().int().min(0).max(65535).default(3020),
    SEED: z.string().optional(),
    DB_HOST: z.string().default("localhost"),
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    DB_USERNAME: z.string().default("postgres"),
    DB_PASSWORD: z.string().default("postgres"),
    DB_NAME: z.string().default("gov_bb_v2"),
    DB_SSL_CA: z.string().optional(),
    BETTER_AUTH_URL: origin,
    EDITOR_ORIGIN: origin,
    BETTER_AUTH_SECRET: z.string().min(32),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    AUTH_BYPASS: z.enum(["true", "false"]).optional(),
  })
  .superRefine((value, context) => {
    // A bypassed API admits any caller, so it is only for an editor on this machine.
    if (
      value.AUTH_BYPASS === "true" &&
      (value.NODE_ENV === "production" ||
        !["localhost", "127.0.0.1"].includes(
          new URL(value.EDITOR_ORIGIN).hostname,
        ))
    )
      context.addIssue({
        code: "custom",
        path: ["AUTH_BYPASS"],
        message:
          "Auth can only be bypassed for a local editor outside production",
      });
    if (value.NODE_ENV !== "production") return;
    for (const field of ["BETTER_AUTH_URL", "EDITOR_ORIGIN"] as const) {
      if (!value[field].startsWith("https://"))
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Production origins require HTTPS",
        });
    }
  });

/** Parse the root's environment once and retain only typed, redacted settings. */
export function parseConfig(
  input: Readonly<Record<string, string | undefined>>,
): Result<AppConfig, ConfigurationError> {
  const parsed = environment.safeParse(input);
  if (!parsed.success)
    return err(
      new ConfigurationError([
        ...new Set(parsed.error.issues.map((issue) => String(issue.path[0]))),
      ]),
    );
  const env = parsed.data;
  return ok({
    port: env.PORT,
    seed: env.SEED !== "false",
    database: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USERNAME,
      password: new Redacted(env.DB_PASSWORD),
      database: env.DB_NAME,
      production: env.NODE_ENV === "production",
      ...(env.DB_SSL_CA ? { ca: env.DB_SSL_CA } : {}),
    },
    auth: {
      apiOrigin: env.BETTER_AUTH_URL,
      editorOrigin: env.EDITOR_ORIGIN,
      secret: new Redacted(env.BETTER_AUTH_SECRET),
      githubClientId: env.GITHUB_CLIENT_ID,
      githubClientSecret: new Redacted(env.GITHUB_CLIENT_SECRET),
    },
    authBypass: env.AUTH_BYPASS === "true",
  });
}
