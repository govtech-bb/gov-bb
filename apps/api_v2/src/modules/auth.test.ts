import { describe, expect, it } from "vitest";
import { admitGitHubIdentity, Forbidden, parseEmployee } from "./auth";

const github = (profile: object = {}, action = "create-user") => ({
  email: "employee@example.com",
  emailVerified: true,
  source: {
    method: "oauth",
    action,
    oauth: {
      providerId: "github",
      profile: {
        email: "employee@example.com",
        organizationMembership: {
          state: "active",
          organization: { login: "govtech-bb" },
        },
        ...profile,
      },
    },
  },
});

describe("GitHub employee admission", () => {
  it.each(["create-user", "sign-in", "link-account"])(
    "checks fresh claims for %s",
    (action) => {
      expect(admitGitHubIdentity(github({}, action))).toEqual({
        ok: true,
        value: undefined,
      });
      expect(
        admitGitHubIdentity(github({ organizationMembership: null }, action))
          .ok,
      ).toBe(false);
    },
  );
  it.each([
    { organizationMembership: undefined },
    {
      organizationMembership: {
        state: "pending",
        organization: { login: "govtech-bb" },
      },
    },
    {
      organizationMembership: {
        state: "active",
        organization: { login: "another-org" },
      },
    },
    { organizationMembership: { state: "active" } },
    { email: "another@example.com" },
  ])("refuses untrusted membership claims %j", (profile) => {
    const result = admitGitHubIdentity(github(profile));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Forbidden);
  });
  it("rejects another provider or an inconsistent derived email", () => {
    const identity = github();
    expect(
      admitGitHubIdentity({
        ...identity,
        source: {
          ...identity.source,
          oauth: { ...identity.source.oauth, providerId: "google" },
        },
      }).ok,
    ).toBe(false);
    expect(
      admitGitHubIdentity({ ...github(), email: "another@govtech.bb" }).ok,
    ).toBe(false);
    expect(
      admitGitHubIdentity({ ...github(), source: { method: "email-password" } })
        .ok,
    ).toBe(false);
  });
  it.each([false, undefined, "true"])(
    "rejects unverified email: %s",
    (emailVerified) => {
      expect(admitGitHubIdentity({ ...github(), emailVerified }).ok).toBe(
        false,
      );
    },
  );
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
});
