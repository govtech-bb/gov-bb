import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Logger } from "pino";
import type { AuthConfig } from "../config";
import type { Database } from "../db";
import {
  admitWorkspaceIdentity,
  AuthUnavailable,
  parseEmployee,
  type Identity,
  type Forbidden,
} from "../modules/auth";
import type { Redacted } from "../modules/redacted";
import { err, ok, type Result } from "../modules/result";
import type { AuthHandler } from "../routes/auth";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
} from "../schema";
import type { SessionReader } from "../services/editor-access";

/** The Drizzle tables BetterAuth reads and writes, keyed by each model's `modelName`. */
const AUTH_SCHEMA = {
  auth_user: authUser,
  auth_session: authSession,
  auth_account: authAccount,
  auth_verification: authVerification,
};

/** BetterAuth's configuration: Google sign-in admitted by Workspace domain, sessions in Postgres through Drizzle. */
export function betterAuthOptions(
  db: Database,
  config: AuthConfig,
  logger: Pick<Logger, "error" | "warn">,
) {
  // The Workspace is checked during sign-in; subsequent requests need only the local session.
  const discardOAuthTokens = async () => ({
    data: {
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    },
  });
  return {
    appName: "GovBB service editor",
    baseURL: config.apiOrigin,
    basePath: "/api/auth",
    secret: config.secret.reveal(),
    // The adapter defaults to no transactions; a first sign-in must insert its
    // user and account together or not at all.
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: AUTH_SCHEMA,
      transaction: true,
    }),
    trustedOrigins: [config.editorOrigin],
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret.reveal(),
        // Default scopes only: openid, email and profile.
        // A hint for Google's account chooser; admission checks the claim.
        hd: config.allowedDomains.length === 1 ? config.allowedDomains[0] : "*",
        disableIdTokenSignIn: true,
      },
    },
    user: {
      modelName: "auth_user",
      validateUserInfo: ({ user, source }) => {
        const admitted = admitWorkspaceIdentity(
          { email: user.email, emailVerified: user.emailVerified, source },
          config.allowedDomains,
        );
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
      // Admit the Workspace account first, then preserve existing users with the same verified email.
      accountLinking: { enabled: true, trustedProviders: [] },
    },
    databaseHooks: {
      // A new user gets no role; an admin grants one (ADR 0134).
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
  } satisfies BetterAuthOptions;
}

/** Build the provider boundary once, over the process's existing database handle. */
export async function createBetterAuth(
  db: Database,
  config: AuthConfig,
  logger: Pick<Logger, "error" | "warn">,
): Promise<AuthHandler & SessionReader> {
  const instance = betterAuth(betterAuthOptions(db, config, logger));
  await instance.$context;
  return {
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
    ): Promise<Result<Identity | null, Forbidden | AuthUnavailable>> {
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
