import { describe, expect, it } from "vitest";
import {
  admitWorkspaceIdentity,
  Forbidden,
  parseEmployee,
  UserId,
} from "./auth";

const ALLOWED = ["govtech.bb"];

const google = (profile: object = {}, action = "create-user") => ({
  email: "employee@govtech.bb",
  emailVerified: true,
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

describe("Google Workspace employee admission", () => {
  it.each(["create-user", "sign-in", "link-account"])(
    "checks fresh claims for %s",
    (action) => {
      expect(admitWorkspaceIdentity(google({}, action), ALLOWED)).toEqual({
        ok: true,
        value: undefined,
      });
      expect(
        admitWorkspaceIdentity(google({ hd: undefined }, action), ALLOWED).ok,
      ).toBe(false);
    },
  );
  it("admits any domain on the allowed list, ignoring the claims' case", () => {
    expect(
      admitWorkspaceIdentity(
        {
          ...google({ email: "Employee@Health.gov.bb", hd: "health.gov.bb" }),
          email: "employee@health.gov.bb",
        },
        ["govtech.bb", "health.gov.bb"],
      ).ok,
    ).toBe(true);
  });
  it.each([
    // A personal Gmail account has no hosted domain.
    { email: "employee@gmail.com", hd: undefined },
    // Another Workspace's account.
    { email: "employee@example.com", hd: "example.com" },
    // An allowed hd whose email is on another domain (a secondary domain or alias).
    { email: "employee@example.com", hd: "govtech.bb" },
    // An allowed email domain under another Workspace.
    { email: "employee@govtech.bb", hd: "example.com" },
    { email_verified: false },
    { email_verified: undefined },
    { email_verified: "true" },
  ])("refuses untrusted Workspace claims %j", (profile) => {
    const identity = google(profile);
    const result = admitWorkspaceIdentity(
      { ...identity, email: identity.source.oauth.profile.email },
      ALLOWED,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Forbidden);
  });
  it("refuses an email that differs from the provider's", () => {
    expect(
      admitWorkspaceIdentity(
        { ...google(), email: "another@govtech.bb" },
        ALLOWED,
      ).ok,
    ).toBe(false);
  });
  it("rejects another provider or a non-OAuth sign-in", () => {
    const identity = google();
    expect(
      admitWorkspaceIdentity(
        {
          ...identity,
          source: {
            ...identity.source,
            oauth: { ...identity.source.oauth, providerId: "github" },
          },
        },
        ALLOWED,
      ).ok,
    ).toBe(false);
    expect(
      admitWorkspaceIdentity(
        { ...google(), source: { method: "email-password" } },
        ALLOWED,
      ).ok,
    ).toBe(false);
  });
  it.each([false, undefined, "true"])(
    "rejects an unverified email: %s",
    (emailVerified) => {
      expect(
        admitWorkspaceIdentity({ ...google(), emailVerified }, ALLOWED).ok,
      ).toBe(false);
    },
  );
  it("admits nobody when no domain is allowed", () => {
    expect(admitWorkspaceIdentity(google(), []).ok).toBe(false);
  });
  it("parses only the employee data needed after session verification", () => {
    expect(
      parseEmployee({
        id: "employee-id",
        email: "EMPLOYEE@EXAMPLE.COM",
        name: "Employee",
        emailVerified: true,
        token: "never-expose",
      }),
    ).toEqual({
      ok: true,
      value: {
        id: "employee-id",
        email: "employee@example.com",
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
  it("refuses an empty user id, which the history would record as system", () => {
    expect(
      parseEmployee({
        id: "",
        email: "employee@govtech.bb",
        name: "Employee",
        emailVerified: true,
      }).ok,
    ).toBe(false);
    expect(UserId.safeParse("").success).toBe(false);
  });
});
