import { describe, expect, it } from "vitest";
import {
  authCallback,
  localReturnPath,
  parseApiOrigin,
  parseAuthSearch,
  parseEmployeeSession,
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
