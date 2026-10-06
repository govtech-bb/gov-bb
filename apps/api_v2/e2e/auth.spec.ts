import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import pino from "pino";
import { z } from "zod";
import {
  createBetterAuth,
  type AuthRuntime,
} from "../src/adapters/better-auth";
import { parseConfig } from "../src/config";
import {
  AUTH_ENV,
  DB,
  HAS_DATABASE,
  createEmployeeSession,
  createScratchDatabase,
  databaseQuery,
  dropScratchDatabase,
  startServer,
  type EmployeeSession,
  type Server,
} from "./support";

const pageSchema = z.object({ id: z.string(), updated_at: z.string() });

describe.skipIf(!HAS_DATABASE)("employee authentication over HTTP", () => {
  let database: string;
  let server: Server;
  let employee: EmployeeSession;
  let pool: Pool;
  let auth: AuthRuntime;

  beforeAll(async () => {
    database = await createScratchDatabase();
    server = await startServer({ DB_NAME: database });
    employee = await createEmployeeSession(database, server.url);
    pool = new Pool({ ...DB, database });
    const config = parseConfig({ ...AUTH_ENV, BETTER_AUTH_URL: server.url });
    if (!config.ok) throw config.error;
    auth = await createBetterAuth(
      pool,
      config.value.auth,
      pino({ enabled: false }),
    );
  });
  afterAll(async () => {
    await pool?.end();
    await server?.stop();
    if (database) await dropScratchDatabase(database);
  });

  const editorHeaders = () => ({
    cookie: employee.cookie,
    origin: AUTH_ENV.EDITOR_ORIGIN,
    "content-type": "application/json",
  });
  const pageInput = {
    url: "/auth-test/draft",
    title: "Private draft",
    body_markdown: "For employees",
    visibility: "draft",
  };

  it("matches the installed BetterAuth schema without another migration", async () => {
    const { getMigrations } = await import("better-auth/db/migration");
    const expected = await getMigrations(auth.instance.options);
    expect(expected.toBeCreated).toEqual([]);
    expect(expected.toBeAdded).toEqual([]);
    expect(expected.toBeAddedIndexes).toEqual([]);
    expect(expected.schemaProblems).toEqual([]);
  });

  it("applies the configured Google admission hook on provisioning and returning sign-in", () => {
    const check = auth.instance.options.user.validateUserInfo;
    for (const action of ["create-user", "sign-in", "link-account"] as const) {
      const claims = {
        email: "employee@govtech.bb",
        email_verified: true,
        hd: "govtech.bb",
      };
      const source = {
        action,
        method: "oauth",
        oauth: { providerId: "google", profile: claims },
      };
      expect(check({ user: { email: claims.email }, source })).toBeUndefined();
      for (const profile of [
        { ...claims, hd: undefined },
        { ...claims, hd: "other.govtech.bb" },
        { ...claims, email_verified: false },
        { ...claims, email: "employee@elsewhere.example" },
      ]) {
        expect(
          check({
            user: { email: profile.email },
            source: { ...source, oauth: { providerId: "google", profile } },
          }),
        ).toMatchObject({ error: "organization_access_denied" });
      }
    }
  });

  it("discards Google tokens before creating and updating account rows", async () => {
    const context = await auth.instance.$context;
    const tokens = {
      accessToken: "unused-google-access-token",
      refreshToken: "unused-google-refresh-token",
      idToken: "unused-google-id-token",
      accessTokenExpiresAt: new Date(Date.now() + 60_000),
      refreshTokenExpiresAt: new Date(Date.now() + 120_000),
    };
    const account = await context.internalAdapter.createAccount({
      userId: employee.userId,
      providerId: "google",
      accountId: "google-test-employee",
      scope: "openid email profile",
      ...tokens,
    });
    const storedAccount = () =>
      databaseQuery(
        database,
        'select "userId", "providerId", "accountId", scope, "accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt" from auth_account where id = $1',
        [account.id],
      );
    const expected = [
      {
        userId: employee.userId,
        providerId: "google",
        accountId: "google-test-employee",
        scope: "openid email profile",
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
      },
    ];
    expect(await storedAccount()).toEqual(expected);
    await context.internalAdapter.updateAccount(account.id, tokens);
    expect(await storedAccount()).toEqual(expected);
    expect(
      (
        await fetch(`${server.url}/version`, {
          headers: { cookie: employee.cookie },
        })
      ).status,
    ).toBe(200);
  });

  it("uses a Secure host-only session cookie for HTTPS deployment", async () => {
    const config = parseConfig({
      ...AUTH_ENV,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://api.govtech.bb",
      EDITOR_ORIGIN: "https://editor.govtech.bb",
    });
    if (!config.ok) throw config.error;
    const productionAuth = await createBetterAuth(
      pool,
      config.value.auth,
      pino({ enabled: false }),
    );
    const context = await productionAuth.instance.$context;
    expect(context.authCookies.sessionToken.attributes).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 8 * 60 * 60,
    });
    expect(context.authCookies.sessionToken.attributes.domain).toBeUndefined();
  });

  it("keeps citizen reads public and rejects every anonymous editor operation", async () => {
    const publicPage = await fetch(
      `${server.url}/pages?url=/money-financial-support/calculate-severance-pay`,
    );
    expect(publicPage.status).toBe(200);
    expect(publicPage.headers.get("cache-control")).toContain("public");
    expect(publicPage.headers.get("set-cookie")).toBeNull();
    for (const [method, path] of [
      ["GET", "/version"],
      ["GET", "/pages/99999999-9999-4999-8999-999999999999"],
      ["HEAD", "/version"],
      ["POST", "/pages"],
      ["PUT", "/pages/99999999-9999-4999-8999-999999999999"],
      ["DELETE", "/pages/99999999-9999-4999-8999-999999999999"],
    ]) {
      const response = await fetch(`${server.url}${path}`, { method });
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("etag")).toBeNull();
    }
  });

  it("uses the cookie identity for private reads and audit actors", async () => {
    const created = await fetch(`${server.url}/pages`, {
      method: "POST",
      headers: editorHeaders(),
      body: JSON.stringify({ ...pageInput, actor: "attacker" }),
    });
    expect(created.status).toBe(201);
    const page = pageSchema.parse(await created.json());
    const draft = await fetch(`${server.url}/pages/${page.id}`, {
      headers: editorHeaders(),
    });
    expect(draft.status).toBe(200);
    expect(draft.headers.get("cache-control")).toBe("no-store");
    expect(draft.headers.get("etag")).toBeNull();
    expect(
      (await fetch(`${server.url}/pages?url=${pageInput.url}`)).status,
    ).toBe(404);
    expect(
      await databaseQuery(
        database,
        "select actor from change_events where entity_id = $1",
        [page.id],
      ),
    ).toEqual([{ actor: employee.userId }]);
  });

  it("requires the configured Origin for cookie-authenticated writes", async () => {
    for (const origin of [undefined, "https://untrusted.example", "null"]) {
      const response = await fetch(`${server.url}/pages`, {
        method: "POST",
        headers: {
          cookie: employee.cookie,
          "content-type": "application/json",
          ...(origin ? { origin } : {}),
        },
        body: JSON.stringify({ ...pageInput, url: "/auth-test/blocked" }),
      });
      expect(response.status).toBe(403);
    }
    expect(
      await databaseQuery(
        database,
        "select id from content_pages where url = $1",
        ["/auth-test/blocked"],
      ),
    ).toEqual([]);
    const allowed = await fetch(`${server.url}/pages`, {
      method: "OPTIONS",
      headers: {
        origin: AUTH_ENV.EDITOR_ORIGIN,
        "access-control-request-method": "PUT",
      },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      AUTH_ENV.EDITOR_ORIGIN,
    );
    expect(allowed.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    const denied = await fetch(`${server.url}/pages`, {
      method: "OPTIONS",
      headers: {
        origin: "https://untrusted.example",
        "access-control-request-method": "PUT",
      },
    });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("uses an absolute eight-hour session without refreshing it on reads", async () => {
    const context = await auth.instance.$context;
    expect(context.authCookies.sessionToken.attributes).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      maxAge: 8 * 60 * 60,
    });
    const before = await databaseQuery(
      database,
      'select "expiresAt", "createdAt", "updatedAt" from auth_session where id = $1',
      [employee.sessionId],
    );
    const row = z
      .object({ expiresAt: z.date(), createdAt: z.date() })
      .parse(before[0]);
    expect(
      row.expiresAt.getTime() - row.createdAt.getTime(),
    ).toBeGreaterThanOrEqual(8 * 60 * 60 * 1000 - 1000);
    expect(
      row.expiresAt.getTime() - row.createdAt.getTime(),
    ).toBeLessThanOrEqual(8 * 60 * 60 * 1000);
    const response = await fetch(`${server.url}/api/auth/get-session`, {
      headers: { cookie: employee.cookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("etag")).toBeNull();
    expect(
      await databaseQuery(
        database,
        'select "expiresAt", "createdAt", "updatedAt" from auth_session where id = $1',
        [employee.sessionId],
      ),
    ).toEqual(before);
  });

  it("rejects expired, revoked and forged sessions even with conditional GET headers", async () => {
    const expired = await createEmployeeSession(database, server.url, {
      expiresAt: new Date(Date.now() - 1000),
    });
    const revoked = await createEmployeeSession(database, server.url);
    await databaseQuery(database, "delete from auth_session where id = $1", [
      revoked.sessionId,
    ]);
    for (const cookie of [
      expired.cookie,
      revoked.cookie,
      `${employee.cookie}forged`,
    ]) {
      const response = await fetch(`${server.url}/version`, {
        headers: { cookie, "if-none-match": "*" },
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("refuses a stored user who no longer meets the employee policy", async () => {
    const denied = await createEmployeeSession(database, server.url, {
      email: "outsider@example.com",
    });
    const response = await fetch(`${server.url}/version`, {
      headers: { cookie: denied.cookie },
    });
    expect(response.status).toBe(403);
  });

  it("starts Google OAuth with a PKCE challenge and rejects external callback URLs", async () => {
    const body = {
      provider: "google",
      disableRedirect: true,
      callbackURL: `${AUTH_ENV.EDITOR_ORIGIN}/auth?state=complete`,
      errorCallbackURL: `${AUTH_ENV.EDITOR_ORIGIN}/auth?state=error`,
    };
    const response = await fetch(`${server.url}/api/auth/sign-in/social`, {
      method: "POST",
      headers: {
        origin: AUTH_ENV.EDITOR_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    const data = z.object({ url: z.string() }).parse(await response.json());
    const url = new URL(data.url);
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("hd")).toBe("govtech.bb");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const denied = await fetch(`${server.url}/api/auth/sign-in/social`, {
      method: "POST",
      headers: {
        origin: AUTH_ENV.EDITOR_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...body,
        callbackURL: "https://untrusted.example/",
      }),
    });
    expect(denied.status).toBe(403);
  });

  it("signs out by deleting the real session and expiring its cookie", async () => {
    const signingOut = await createEmployeeSession(database, server.url);
    const blocked = await fetch(`${server.url}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        origin: "https://untrusted.example",
        cookie: signingOut.cookie,
      },
    });
    expect(blocked.status).toBe(403);
    expect(
      (
        await fetch(`${server.url}/version`, {
          headers: { cookie: signingOut.cookie },
        })
      ).status,
    ).toBe(200);
    const response = await fetch(`${server.url}/api/auth/sign-out`, {
      method: "POST",
      headers: { origin: AUTH_ENV.EDITOR_ORIGIN, cookie: signingOut.cookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    expect(
      (
        await fetch(`${server.url}/version`, {
          headers: { cookie: signingOut.cookie },
        })
      ).status,
    ).toBe(401);
  });

  it("does not log callback credentials or session cookies", async () => {
    await fetch(
      `${server.url}/api/auth/callback/google?code=never-log-this-code&state=never-log-this-state`,
      { redirect: "manual" },
    );
    expect(server.stderr).not.toContain("never-log-this-code");
    expect(server.stderr).not.toContain("never-log-this-state");
    expect(server.stderr).not.toContain(employee.token);
    expect(server.stderr).not.toContain(AUTH_ENV.BETTER_AUTH_SECRET);
  });
});
