import { describe, expect, it, vi } from "vitest";
import {
  AuthFailure,
  authCallback,
  localReturnPath,
  parseApiOrigin,
  parseAuthSearch,
  parseEmployeeSession,
  workspaceAdmission,
} from "./session";

describe("authentication boundaries", () => {
  it("requires an explicit HTTPS production API origin", () => {
    expect(parseApiOrigin(undefined, false)).toEqual({ ok: true, value: "http://localhost:3020" });
    expect(parseApiOrigin("https://api.govtech.bb/", true)).toEqual({
      ok: true,
      value: "https://api.govtech.bb",
    });

    for (const value of [
      undefined,
      "",
      "http://api.govtech.bb",
      "https://user:secret@api.govtech.bb",
      "https://api.govtech.bb/path",
      "https://api.govtech.bb?key=x",
      "https://api.govtech.bb#x",
    ]) {
      expect(parseApiOrigin(value, true).ok).toBe(false);
    }
  });

  it("keeps encoded workspace identities, query and fragment on the local origin", () => {
    const path = "/services/a%2Fb/document%20%23%C3%A9?view=source#content";
    expect(localReturnPath(path)).toBe(path);
    const callback = new URL(authCallback("https://editor.govtech.bb", "complete", path));
    expect(callback.origin).toBe("https://editor.govtech.bb");
    expect(callback.pathname).toBe("/auth");
    expect(callback.searchParams.get("returnTo")).toBe(path);
  });

  it.each([
    "/categories?sort=title#list",
    "/content-types",
    "/content-types/new",
    "/content-types/announcements",
    "/collections",
    "/collections/contacts?record=barbados-drug-service",
    "/collections/announcements/",
    "/collections/announcements/new",
    "/collections/announcements/entry-1?view=source#content",
  ])("returns to the protected workspace destination %s", (path) => {
    expect(localReturnPath(path)).toBe(path);
    expect(
      new URL(authCallback("https://editor.govtech.bb", "complete", path)).searchParams.get(
        "returnTo",
      ),
    ).toBe(path);
  });

  it.each([
    "/categories/other",
    "/content-types-extra",
    "/collections/a/b/c",
    "/prototypes/components",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/auth?state=sign-in",
    "/services/../auth",
    "/services/%2e%2e/auth",
    "/services/\n/evil",
  ])("rejects an unsafe or looping return path %s", (path) => {
    expect(localReturnPath(path)).toBe("/services");
  });

  it("opens a plain auth URL as explicit sign-in, while provider errors stay errors", () => {
    expect(parseAuthSearch({}).state).toBe("sign-in");
    expect(parseAuthSearch({ error: "access_denied" }).state).toBe("error");
  });

  it("does not convert untrusted error text or unknown states into automatic sign-in", () => {
    expect(
      parseAuthSearch({
        state: "unknown",
        error: "private provider details",
        returnTo: "//evil.example",
      }),
    ).toEqual({ state: "error", returnTo: "/services", reason: "provider" });
  });

  it("distinguishes expired/missing sessions from malformed responses", () => {
    const now = Date.parse("2026-10-06T12:00:00Z");

    const session = {
      session: { expiresAt: "2026-10-06T20:00:00Z" },
      user: { email: "employee@govtech.bb" },
    };

    expect(parseEmployeeSession(session, now)).toEqual({
      ok: true,
      value: { email: "employee@govtech.bb", expiresAt: Date.parse(session.session.expiresAt) },
    });
    expect(parseEmployeeSession(session, now + 8 * 60 * 60 * 1000)).toEqual({
      ok: true,
      value: null,
    });
    expect(parseEmployeeSession(null, now)).toEqual({ ok: true, value: null });

    for (const value of [
      undefined,
      {},
      { session: null },
      { ...session, session: { expiresAt: "invalid" } },
    ])
      expect(parseEmployeeSession(value, now).ok).toBe(false);
  });
});

describe("workspace admission", () => {
  const employee = { email: "officer@govtech.bb", expiresAt: 5_000 };

  it("asks the API on entering the workspace, then trusts that session between its screens until it expires", async () => {
    let time = 1_000;
    const admit = workspaceAdmission(() => time);
    const check = vi.fn(async () => ({ ok: true as const, value: employee }));

    expect(await admit("enter", check)).toEqual({ ok: true, value: employee });
    expect(await admit("stay", check)).toEqual({ ok: true, value: employee });
    await admit("stay", check);
    expect(check).toHaveBeenCalledTimes(1);

    time = 5_000;
    await admit("stay", check);
    expect(check).toHaveBeenCalledTimes(2);

    // Entering again always asks
    time = 1_000;
    await admit("enter", check);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("forgets the session once a check fails or finds the author signed out", async () => {
    const admit = workspaceAdmission(() => 1_000);

    await admit("enter", async () => ({ ok: true, value: employee }));

    const failed = await admit("enter", async () => ({
      ok: false,
      error: new AuthFailure("unavailable"),
    }));

    expect(failed.ok).toBe(false);

    const signedOut = vi.fn(async () => ({ ok: true as const, value: null }));

    expect(await admit("stay", signedOut)).toEqual({ ok: true, value: null });
    expect(signedOut).toHaveBeenCalledTimes(1);
  });
});
