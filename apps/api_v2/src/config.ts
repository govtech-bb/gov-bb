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

/**
 * How review emails go out (#3267): not at all, to the log for local runs and
 * tests, or through SES from a verified sender.
 */
export type NotificationsConfig =
  | { readonly transport: "off" | "log" }
  | {
      readonly transport: "ses";
      readonly from: string;
      readonly region: string;
    };

/** The process's parsed settings; inner modules never read environment variables. */
export interface AppConfig {
  readonly port: number;
  readonly seed: boolean;
  /** The site's preview token; without it, every preview read is refused. */
  readonly previewSecret?: Redacted<string>;
  readonly database: DatabaseConfig;
  readonly auth: AuthConfig;
  /** Emails, lowercased, granted the admin role whenever they sign in. */
  readonly adminEmails: readonly string[];
  /**
   * Local development only: skip sign-in and run every editor request as a
   * fixed developer. Refused in production and unless the editor is local.
   */
  readonly authBypass: boolean;
  /** Review emails to approvers and submitters; off unless an environment turns them on. */
  readonly notifications: NotificationsConfig;
}

/** Invalid startup settings, reporting field names but never supplied values. */
export class ConfigurationError extends Error {
  /** Stable failure tag for startup diagnostics. */
  readonly _tag = "ConfigurationError";
  /**
   * Names of settings that need correction, and the reasons this module wrote
   * for its own rules. Neither carries a supplied value.
   */
  constructor(
    readonly fields: readonly string[],
    readonly reasons: readonly string[] = [],
  ) {
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
    // Opt-in: re-seeding on every boot would bring back pages editors deleted.
    SEED: z.stringbool().default(false),
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
    PREVIEW_SECRET: z.string().min(1).optional(),
    // Comma-separated; how an environment always has an admin (ADR 0079).
    API_V2_ADMIN_EMAILS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      )
      .pipe(z.array(z.email())),
    // Off by default: an environment turns review emails on (#3267).
    REVIEW_NOTIFICATIONS: z.enum(["off", "log", "ses"]).default("off"),
    // The same sender settings as apps/api's SES mailer.
    SES_FROM_ADDRESS: z.string().min(1).optional(),
    SES_REGION: z.string().min(1).optional(),
    AWS_DEFAULT_REGION: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    // Without an admin nobody can grant approver, so nobody can change what citizens see.
    if (value.AUTH_BYPASS !== "true" && value.API_V2_ADMIN_EMAILS.length === 0)
      context.addIssue({
        code: "custom",
        path: ["API_V2_ADMIN_EMAILS"],
        message:
          "Set API_V2_ADMIN_EMAILS to at least one admin's email: without an admin nobody can grant the approver role (ADR 0079)",
      });
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
    if (value.REVIEW_NOTIFICATIONS === "ses" && !value.SES_FROM_ADDRESS)
      context.addIssue({
        code: "custom",
        path: ["SES_FROM_ADDRESS"],
        message:
          "Set SES_FROM_ADDRESS to a verified SES sender: REVIEW_NOTIFICATIONS=ses sends review emails from it",
      });
    if (value.NODE_ENV !== "production") return;
    // A deployed database gets the estate once, from import-estate (#3052).
    if (value.SEED)
      context.addIssue({
        code: "custom",
        path: ["SEED"],
        message: "Production does not seed on boot",
      });
    // On in production means emails reach people, not only the log.
    if (value.REVIEW_NOTIFICATIONS === "log")
      context.addIssue({
        code: "custom",
        path: ["REVIEW_NOTIFICATIONS"],
        message:
          "Production sends review emails with SES or not at all: set REVIEW_NOTIFICATIONS to ses or off",
      });
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
      new ConfigurationError(
        [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))],
        // Only this module's own messages: Zod's can quote what was supplied.
        parsed.error.issues
          .filter((issue) => issue.code === "custom")
          .map((issue) => issue.message),
      ),
    );
  const env = parsed.data;
  return ok({
    port: env.PORT,
    seed: env.SEED,
    ...(env.PREVIEW_SECRET
      ? { previewSecret: new Redacted(env.PREVIEW_SECRET) }
      : {}),
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
    adminEmails: env.API_V2_ADMIN_EMAILS,
    authBypass: env.AUTH_BYPASS === "true",
    // The refinement above refuses ses without a sender.
    notifications:
      env.REVIEW_NOTIFICATIONS === "ses" && env.SES_FROM_ADDRESS
        ? {
            transport: "ses",
            from: env.SES_FROM_ADDRESS,
            region: env.SES_REGION ?? env.AWS_DEFAULT_REGION ?? "us-east-1",
          }
        : { transport: env.REVIEW_NOTIFICATIONS === "log" ? "log" : "off" },
  });
}
