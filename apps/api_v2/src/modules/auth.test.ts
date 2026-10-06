import { describe, expect, it } from "vitest";
import { admitGoogleIdentity, Forbidden, parseEmployee } from "./auth";

const google = (profile: object = {}, action = "create-user") => ({
  email: "employee@govtech.bb",
  source: {
    method: "oauth",
    action,
    oauth: {
      providerId: "google",
      profile: {
        email: "employee@govtech.bb",
        email_verified: true,
        hd: "govtech.bb",
        ...profile,
      },
    },
  },
});

describe("Google employee admission", () => {
  it.each(["create-user", "sign-in", "link-account"])(
    "checks fresh claims for %s",
    (action) => {
      expect(admitGoogleIdentity(google({}, action))).toEqual({
        ok: true,
        value: undefined,
      });
      expect(
        admitGoogleIdentity(google({ hd: "outside.example" }, action)).ok,
      ).toBe(false);
    },
  );
  it.each([
    { hd: undefined },
    { hd: "GOVTECH.BB" },
    { hd: "sub.govtech.bb" },
    { hd: "govtech.bb.attacker.example" },
    { email_verified: false },
    { email_verified: "true" },
    { email: "employee@gmail.com" },
  ])("refuses untrusted membership claims %j", (profile) => {
    const result = admitGoogleIdentity(google(profile));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Forbidden);
  });
  it("rejects another provider or an inconsistent derived email", () => {
    expect(
      admitGoogleIdentity({ ...google(), email: "another@govtech.bb" }).ok,
    ).toBe(false);
    expect(
      admitGoogleIdentity({ ...google(), source: { method: "email-password" } })
        .ok,
    ).toBe(false);
  });
  it("parses only the employee data needed after session verification", () => {
    expect(
      parseEmployee({
        id: "employee-id",
        email: "EMPLOYEE@GOVTECH.BB",
        name: "Employee",
        emailVerified: true,
        token: "never-expose",
      }),
    ).toEqual({
      ok: true,
      value: {
        id: "employee-id",
        email: "employee@govtech.bb",
        name: "Employee",
      },
    });
    expect(
      parseEmployee({
        id: "employee-id",
        email: "employee@govtech.bb",
        name: "Employee",
        emailVerified: false,
      }).ok,
    ).toBe(false);
  });
});
