import { betterAuth } from "better-auth";
import { Pool } from "pg";
import pino from "pino";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { parseConfig, type AuthConfig } from "../config";
import { betterAuthOptions } from "./better-auth";

const pool = new Pool();
const authWith = (config: AuthConfig) =>
  betterAuth(betterAuthOptions(pool, config, pino({ enabled: false })));
let auth: ReturnType<typeof authWith>;

beforeAll(() => {
  const config = parseConfig({
    BETTER_AUTH_URL: "http://localhost:3020",
    EDITOR_ORIGIN: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
    GITHUB_CLIENT_ID: "test-client",
    GITHUB_CLIENT_SECRET: "test-client-secret",
  });
  if (!config.ok) throw config.error;
  auth = authWith(config.value.auth);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => pool.end());

describe("GitHub provider boundary", () => {
  it.each([
    { status: 200, state: "active", verified: true, admitted: true },
    { status: 200, state: "pending", verified: true, admitted: false },
    { status: 200, state: "active", verified: false, admitted: false },
    { status: 404, state: "active", verified: true, admitted: false },
    { status: 403, state: "active", verified: true, admitted: false },
    { status: 503, state: "active", verified: true, admitted: false },
  ])(
    "checks private email and active membership: %j",
    async ({ status, state, verified, admitted }) => {
      const fetch = vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          expect(new Headers(init?.headers).get("authorization")).toBe(
            "Bearer test-token",
          );
          if (url === "https://api.github.com/user")
            return Response.json({
              id: 123,
              login: "member",
              name: "Member",
              email: null,
            });
          if (url === "https://api.github.com/user/emails")
            return Response.json([
              { email: "member@example.com", primary: true, verified },
            ]);
          expect(url).toBe(
            "https://api.github.com/user/memberships/orgs/govtech-bb",
          );
          return Response.json(
            { state, organization: { login: "govtech-bb" } },
            { status },
          );
        },
      );
      vi.stubGlobal("fetch", fetch);
      const identity = await auth.options.socialProviders.github.getUserInfo({
        accessToken: "test-token",
        tokenType: "bearer",
      });
      expect(identity?.user).toMatchObject({
        email: "member@example.com",
        emailVerified: verified,
      });
      if (!identity) throw new Error("Expected a GitHub identity");
      for (const action of [
        "create-user",
        "sign-in",
        "link-account",
      ] as const) {
        const result = auth.options.user.validateUserInfo({
          user: {
            email: identity.user.email ?? undefined,
            emailVerified: identity.user.emailVerified,
          },
          source: {
            method: "oauth",
            action,
            oauth: { providerId: "github", profile: identity.data },
          },
        });
        if (admitted) expect(result).toBeUndefined();
        else
          expect(result).toMatchObject({ error: "organization_access_denied" });
      }
      expect(fetch).toHaveBeenCalledTimes(3);
    },
  );

  it("requests email and org access with PKCE and the GitHub callback", async () => {
    const context = await auth.$context;
    const provider = context.socialProviders.find(
      (provider) => provider.id === "github",
    );
    if (!provider) throw new Error("GitHub provider is missing");
    const url = await provider.createAuthorizationURL({
      state: "test-state",
      codeVerifier: "test-code-verifier",
      redirectURI: "http://localhost:3020/api/auth/callback/github",
    });
    expect(url.origin + url.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining(["read:user", "user:email", "read:org"]),
    );
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3020/api/auth/callback/github",
    );
    expect(context.socialProviders.map((provider) => provider.id)).toEqual([
      "github",
    ]);
  });
});
