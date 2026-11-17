import { betterAuth } from "better-auth";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseConfig, type AuthConfig } from "../config";
import type { Database } from "../db";
import { createTestDb } from "../test-db";
import { betterAuthOptions } from "./better-auth";

const pool = new Pool();
const authWith = (config: AuthConfig, db: Database = drizzle(pool)) =>
  betterAuth(betterAuthOptions(db, config, pino({ enabled: false })));
let authConfig: AuthConfig;
let auth: ReturnType<typeof authWith>;

beforeAll(() => {
  const config = parseConfig({
    BETTER_AUTH_URL: "http://localhost:3020",
    EDITOR_ORIGIN: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_ALLOWED_DOMAINS: "govtech.bb",
    API_V2_ADMIN_EMAILS: "admin@govtech.bb",
  });
  if (!config.ok) throw config.error;
  authConfig = config.value.auth;
  auth = authWith(authConfig);
});
afterAll(() => pool.end());

// An unsigned ID token: getUserInfo only decodes it, because it came straight
// from Google's token endpoint during the code exchange.
const idToken = (claims: object) =>
  [{ alg: "none" }, claims, "signature"]
    .map((part) =>
      typeof part === "string"
        ? part
        : Buffer.from(JSON.stringify(part)).toString("base64url"),
    )
    .join(".");

describe("Google provider boundary", () => {
  it.each([
    {
      hd: "govtech.bb",
      email: "member@govtech.bb",
      verified: true,
      admitted: true,
    },
    {
      hd: "govtech.bb",
      email: "member@govtech.bb",
      verified: false,
      admitted: false,
    },
    {
      hd: undefined,
      email: "member@gmail.com",
      verified: true,
      admitted: false,
    },
    {
      hd: "example.com",
      email: "member@example.com",
      verified: true,
      admitted: false,
    },
  ])(
    "admits only a verified account on an allowed Workspace domain: %j",
    async ({ hd, email, verified, admitted }) => {
      const provider = (await auth.$context).socialProviders.find(
        (provider) => provider.id === "google",
      );
      if (!provider) throw new Error("Google provider is missing");
      const identity = await provider.getUserInfo({
        idToken: idToken({
          sub: "123",
          email,
          email_verified: verified,
          hd,
          name: "Member",
        }),
        tokenType: "bearer",
      });
      for (const action of [
        "create-user",
        "sign-in",
        "link-account",
      ] as const) {
        const result = identity
          ? auth.options.user.validateUserInfo({
              user: {
                email: identity.user.email ?? undefined,
                emailVerified: identity.user.emailVerified,
              },
              source: {
                method: "oauth",
                action,
                oauth: {
                  providerId: "google",
                  profile: identity.data as Record<string, unknown>,
                },
              },
            })
          : { error: "provider_refused" };
        if (admitted) expect(result).toBeUndefined();
        else expect(result).toHaveProperty("error");
      }
    },
  );

  it("refuses an account outside the allowed domains even if the provider returns it", () => {
    const result = auth.options.user.validateUserInfo({
      user: { email: "member@example.com", emailVerified: true },
      source: {
        method: "oauth",
        action: "create-user",
        oauth: {
          providerId: "google",
          profile: {
            email: "member@example.com",
            email_verified: true,
            hd: "example.com",
          },
        },
      },
    });
    expect(result).toMatchObject({ error: "organization_access_denied" });
  });

  it("requests only openid, email and profile with PKCE, the Google callback and the domain hint", async () => {
    const context = await auth.$context;
    const provider = context.socialProviders.find(
      (provider) => provider.id === "google",
    );
    if (!provider) throw new Error("Google provider is missing");
    const url = await provider.createAuthorizationURL({
      state: "test-state",
      codeVerifier: "test-code-verifier",
      redirectURI: "http://localhost:3020/api/auth/callback/google",
    });
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([
      "email",
      "openid",
      "profile",
    ]);
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3020/api/auth/callback/google",
    );
    expect(url.searchParams.get("hd")).toBe("govtech.bb");
    expect(context.socialProviders.map((provider) => provider.id)).toEqual([
      "google",
    ]);
  });

  it("hints any Workspace domain when more than one is allowed", async () => {
    const context = await authWith({
      ...authConfig,
      allowedDomains: ["govtech.bb", "health.gov.bb"],
    }).$context;
    const provider = context.socialProviders.find(
      (provider) => provider.id === "google",
    );
    if (!provider) throw new Error("Google provider is missing");
    const url = await provider.createAuthorizationURL({
      state: "test-state",
      codeVerifier: "test-code-verifier",
      redirectURI: "http://localhost:3020/api/auth/callback/google",
    });
    expect(url.searchParams.get("hd")).toBe("*");
  });
});

describe("a new user", () => {
  it("gets no role at first sign-in; an admin grants one (ADR 0134)", async () => {
    const { db, close } = await createTestDb();
    try {
      const context = await authWith(authConfig, db).$context;

      const { user } = await context.internalAdapter.createOAuthUser(
        { email: "new@govtech.bb", name: "New", emailVerified: true },
        { accountId: "12345", providerId: "google" },
      );

      const { rows } = await db.execute(
        sql`select role from user_roles where user_id = ${user.id}`,
      );
      expect(rows).toEqual([]);
    } finally {
      await close();
    }
  });
});

describe("first sign-in", () => {
  it("leaves no user behind when the account cannot be created", async () => {
    const { db, close } = await createTestDb();
    try {
      const context = await authWith(authConfig, db).$context;

      await expect(
        context.internalAdapter.createOAuthUser(
          { email: "new@govtech.bb", name: "New", emailVerified: true },
          // auth_account.accountId is not null, so the second insert fails.
          { accountId: null as unknown as string, providerId: "google" },
        ),
      ).rejects.toThrow();

      const { rows } = await db.execute(
        sql`select 1 from auth_user where email = 'new@govtech.bb'`,
      );
      expect(rows).toEqual([]);
    } finally {
      await close();
    }
  });
});
