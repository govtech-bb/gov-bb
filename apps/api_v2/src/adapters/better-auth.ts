import type { Pool } from "pg";
import type { Logger } from "pino";
import type { AuthConfig } from "../config";
import {
  admitGitHubIdentity,
  AuthUnavailable,
  parseEmployee,
  GITHUB_ORGANIZATION,
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
  const { github } = await import("better-auth/social-providers");
  const githubOptions = {
    clientId: config.githubClientId,
    clientSecret: config.githubClientSecret.reveal(),
    scope: ["read:org"],
    disableIdTokenSignIn: true,
  };
  const githubProvider = github(githubOptions);
  // Membership is checked during sign-in; subsequent requests need only the local session.
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
      github: {
        ...githubOptions,
        async getUserInfo(tokens) {
          const identity = await githubProvider.getUserInfo(tokens);
          if (!identity) return null;
          const membership = await fetch(
            `https://api.github.com/user/memberships/orgs/${GITHUB_ORGANIZATION}`,
            {
              headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "gov-bb-editor",
                "X-GitHub-Api-Version": "2022-11-28",
              },
              signal: AbortSignal.timeout(15_000),
            },
          );
          return {
            ...identity,
            data: {
              ...identity.data,
              organizationMembership: membership.ok
                ? await membership.json()
                : null,
            },
          };
        },
      },
    },
    user: {
      modelName: "auth_user",
      validateUserInfo: ({ user, source }) => {
        const admitted = admitGitHubIdentity({
          email: user.email,
          emailVerified: user.emailVerified,
          source,
        });
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
      // Admit org membership first, then preserve existing users with the same verified email.
      accountLinking: { enabled: true, trustedProviders: [] },
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
