import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEditorAuth } from "./better-auth-client";

let origin: string;

let response: string;

let status = 200;

const requests: { url: string; method: string; body: string }[] = [];

const server = createServer(async (request, reply) => {
  let body = "";

  for await (const chunk of request) body += chunk;
  requests.push({ url: request.url ?? "", method: request.method ?? "", body });
  reply.writeHead(status, { "content-type": "application/json" });
  reply.end(response);
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Parse the Node server address union at its I/O boundary.
  if (!address || typeof address === "string") throw new Error("Test server has no TCP address");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("Better Auth HTTP client", () => {
  it("checks API sessions without relying on cookie-cache data", async () => {
    response = JSON.stringify({
      session: { expiresAt: "2026-10-06T20:00:00Z" },
      user: { email: "employee@govtech.bb" },
    });
    const auth = createEditorAuth(origin, () => Date.parse("2026-10-06T12:00:00Z"));
    expect(await auth.session()).toMatchObject({
      ok: true,
      value: { email: "employee@govtech.bb" },
    });
    expect(requests.at(-1)?.url).toBe("/api/auth/get-session?disableCookieCache=true");
    response = "null";
    expect(await auth.session()).toEqual({ ok: true, value: null });
    status = 503;
    response = JSON.stringify({ message: "upstream unavailable" });
    expect(await auth.session()).toMatchObject({ ok: false, error: { reason: "unavailable" } });
    status = 200;
  });

  it("initiates GitHub OAuth with safe explicit success and error callbacks", async () => {
    response = JSON.stringify({
      url: "https://github.com/login/oauth/authorize?state=test",
      redirect: true,
    });
    const auth = createEditorAuth(origin, Date.now);
    expect(await auth.signIn("https://editor.govtech.bb", "/services/a/b")).toEqual({
      ok: true,
      value: "https://github.com/login/oauth/authorize?state=test",
    });
    const request = requests.at(-1);
    expect(request?.method).toBe("POST");
    expect(JSON.parse(request?.body ?? "null")).toEqual({
      provider: "github",
      disableRedirect: true,
      callbackURL: "https://editor.govtech.bb/auth?state=complete&returnTo=%2Fservices%2Fa%2Fb",
      errorCallbackURL: "https://editor.govtech.bb/auth?state=error&returnTo=%2Fservices%2Fa%2Fb",
    });

    for (const url of [
      "https://evil.example",
      "https://accounts.google.com/o/oauth2/v2/auth",
      "https://github.com/other",
      "https://github.com:8443/login/oauth/authorize",
      "https://user:pass@github.com/login/oauth/authorize",
      "http://github.com/login/oauth/authorize",
    ]) {
      response = JSON.stringify({ url, redirect: true });
      expect(await auth.signIn("https://editor.govtech.bb", "/services")).toMatchObject({
        ok: false,
        error: { reason: "provider" },
      });
    }
  });

  it("reports revocation failures without claiming the user signed out", async () => {
    const auth = createEditorAuth(origin, Date.now);
    response = JSON.stringify({ success: true });
    expect(await auth.signOut()).toEqual({ ok: true, value: undefined });
    expect(requests.at(-1)?.url).toBe("/api/auth/sign-out");
    status = 503;
    response = JSON.stringify({ message: "upstream unavailable" });
    expect(await auth.signOut()).toMatchObject({ ok: false, error: { reason: "unavailable" } });
    status = 200;
  });
});
