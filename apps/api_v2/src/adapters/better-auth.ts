import type { Pool } from "pg";
import type { Logger } from "pino";
import type { AuthConfig } from "../config";
import {
  admitGoogleIdentity,
  AuthUnavailable,
  parseEmployee,
  WORKSPACE_DOMAIN,
  type Employee,
  type Forbidden,
} from "../modules/auth";
import type { Redacted } from "../modules/redacted";
import { err, ok, type Result } from "../modules/result";

/** Build the provider boundary once, using the process's existing Postgres pool. */
export async function createBetterAuth(
  pool: Pool,
  config: AuthConfig,
  logger: Pick<Logger, "error" | "warn">,
) {
  // Native import keeps this CommonJS application's compiled entrypoint compatible with Better Auth's ESM package.
  const { betterAuth } = await import("better-auth");
  // Google claims are consumed before account persistence; the editor never calls Google APIs.
  const discardOAuthTokens = async () => ({
    data: {
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    },
  });
  const instance = betterAuth({
    appName: "GovBB service editor",
    baseURL: config.apiOrigin,
    basePath: "/api/auth",
    secret: config.secret.reveal(),
    database: pool,
    trustedOrigins: [config.editorOrigin],
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret.reveal(),
        hd: WORKSPACE_DOMAIN,
        accessType: "online",
        disableIdTokenSignIn: true,
      },
    },
    user: {
      modelName: "auth_user",
      validateUserInfo: ({ user, source }) => {
        const admitted = admitGoogleIdentity({ email: user.email, source });
        if (!admitted.ok)
          return {
            error: "organization_access_denied",
            errorDescription: admitted.error.message,
          };
      },
    },
    session: {
      modelName: "auth_session",
      expiresIn: 8 * 60 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    account: {
      modelName: "auth_account",
      accountLinking: { enabled: false },
    },
    databaseHooks: {
      account: {
        create: { before: discardOAuthTokens },
        update: { before: discardOAuthTokens },
      },
    },
    verification: { modelName: "auth_verification" },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: config.apiOrigin.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    onAPIError: { errorURL: `${config.editorOrigin}/auth?state=error` },
    logger: {
      log(level) {
        // SDK diagnostics can contain SQL parameters and provider tokens. Request logs retain correlation.
        if (level === "error")
          logger.error(
            { provider: "better-auth" },
            "authentication provider error",
          );
        if (level === "warn")
          logger.warn(
            { provider: "better-auth" },
            "authentication provider warning",
          );
      },
    },
  });
  await instance.$context;
  return {
    instance,
    /** Delegate the auth protocol without exposing unexpected provider failures. */
    async handle(request: Request): Promise<Response> {
      try {
        return await instance.handler(request);
      } catch {
        return Response.json({ error: "auth_unavailable" }, { status: 503 });
      }
    },
    /** Verify the cookie in Postgres, then retain only the admitted employee. */
    async findSession(
      credential: Redacted<string>,
    ): Promise<Result<Employee | null, Forbidden | AuthUnavailable>> {
      try {
        const session = await instance.api.getSession({
          headers: new Headers({ cookie: credential.reveal() }),
        });
        return session === null ? ok(null) : parseEmployee(session.user);
      } catch {
        return err(new AuthUnavailable());
      }
    },
  };
}

/** The concrete runtime remains confined to adapters, roots, and integration tests. */
export type AuthRuntime = Awaited<ReturnType<typeof createBetterAuth>>;
