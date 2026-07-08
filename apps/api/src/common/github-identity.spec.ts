import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authorizeGitHubToken,
  extractBearerToken,
  isMemberAuthorized,
} from "./github-identity";

describe("extractBearerToken", () => {
  it("parses a bearer token case-insensitively, else undefined", () => {
    expect(extractBearerToken("Bearer abc")).toBe("abc");
    expect(extractBearerToken("bearer  abc ")).toBe("abc");
    expect(extractBearerToken("Token abc")).toBeUndefined();
    expect(extractBearerToken(undefined)).toBeUndefined();
    expect(extractBearerToken("Bearer ")).toBeUndefined();
  });
});

describe("isMemberAuthorized", () => {
  it("allows any authenticated user in dev", () => {
    expect(
      isMemberAuthorized({
        isDev: true,
        isTeamMember: false,
        hasRepoWrite: false,
      }),
    ).toBe(true);
  });
  it("requires team membership or repo write in production", () => {
    expect(
      isMemberAuthorized({
        isDev: false,
        isTeamMember: true,
        hasRepoWrite: false,
      }),
    ).toBe(true);
    expect(
      isMemberAuthorized({
        isDev: false,
        isTeamMember: false,
        hasRepoWrite: true,
      }),
    ).toBe(true);
    expect(
      isMemberAuthorized({
        isDev: false,
        isTeamMember: false,
        hasRepoWrite: false,
      }),
    ).toBe(false);
  });
});

describe("authorizeGitHubToken", () => {
  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
    vi.unstubAllGlobals();
  });

  function stubFetch(
    handler: (url: string) => { status: number; body: unknown },
  ) {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const { status, body } = handler(url);
        return Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(body),
        } as Response);
      }),
    );
  }

  it("returns null for a missing or invalid token", async () => {
    expect(await authorizeGitHubToken(undefined)).toBeNull();
    stubFetch(() => ({ status: 401, body: {} }));
    expect(await authorizeGitHubToken("bad")).toBeNull();
  });

  it("returns the login for any valid token in dev (no membership call)", async () => {
    process.env.NODE_ENV = "development";
    stubFetch((url) => {
      if (url.endsWith("/user"))
        return { status: 200, body: { login: "octocat" } };
      throw new Error(`unexpected fetch: ${url}`);
    });
    expect(await authorizeGitHubToken("good")).toBe("octocat");
  });

  it("in production returns the login only for a team member", async () => {
    process.env.NODE_ENV = "production";
    process.env.GITHUB_ORG = "govtech-bb";
    process.env.GITHUB_TEAM_SLUG = "flag-admins";
    stubFetch((url) => {
      if (url.endsWith("/user"))
        return { status: 200, body: { login: "octocat" } };
      if (url.includes("/memberships/"))
        return { status: 200, body: { state: "active" } };
      throw new Error(`unexpected fetch: ${url}`);
    });
    expect(await authorizeGitHubToken("good")).toBe("octocat");
  });

  it("in production returns null for a non-member without repo write", async () => {
    process.env.NODE_ENV = "production";
    process.env.GITHUB_ORG = "govtech-bb";
    process.env.GITHUB_TEAM_SLUG = "flag-admins";
    stubFetch((url) => {
      if (url.endsWith("/user"))
        return { status: 200, body: { login: "stranger" } };
      if (url.includes("/memberships/")) return { status: 404, body: {} };
      if (url.includes("/permission")) return { status: 404, body: {} };
      throw new Error(`unexpected fetch: ${url}`);
    });
    expect(await authorizeGitHubToken("good")).toBeNull();
  });

  it("in production authorizes a non-member with repo write access", async () => {
    process.env.NODE_ENV = "production";
    process.env.GITHUB_ORG = "govtech-bb";
    process.env.GITHUB_TEAM_SLUG = "flag-admins";
    stubFetch((url) => {
      if (url.endsWith("/user"))
        return { status: 200, body: { login: "maintainer" } };
      if (url.includes("/memberships/")) return { status: 404, body: {} };
      if (url.includes("/permission"))
        return { status: 200, body: { permission: "admin" } };
      throw new Error(`unexpected fetch: ${url}`);
    });
    expect(await authorizeGitHubToken("good")).toBe("maintainer");
  });

  it("throws in production when GITHUB_ORG / GITHUB_TEAM_SLUG are unset", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.GITHUB_ORG;
    delete process.env.GITHUB_TEAM_SLUG;
    stubFetch((url) => {
      if (url.endsWith("/user"))
        return { status: 200, body: { login: "octocat" } };
      throw new Error(`unexpected fetch: ${url}`);
    });
    await expect(authorizeGitHubToken("good")).rejects.toThrow(
      /GITHUB_ORG and GITHUB_TEAM_SLUG/,
    );
  });

  it("throws on an unexpected GitHub error during the membership check", async () => {
    process.env.NODE_ENV = "production";
    process.env.GITHUB_ORG = "govtech-bb";
    process.env.GITHUB_TEAM_SLUG = "flag-admins";
    stubFetch((url) => {
      if (url.endsWith("/user"))
        return { status: 200, body: { login: "octocat" } };
      if (url.includes("/memberships/")) return { status: 500, body: {} };
      throw new Error(`unexpected fetch: ${url}`);
    });
    await expect(authorizeGitHubToken("good")).rejects.toThrow(
      /team membership check failed/,
    );
  });

  it("throws on an unexpected GitHub error during the repo permission check", async () => {
    process.env.NODE_ENV = "production";
    process.env.GITHUB_ORG = "govtech-bb";
    process.env.GITHUB_TEAM_SLUG = "flag-admins";
    stubFetch((url) => {
      if (url.endsWith("/user"))
        return { status: 200, body: { login: "octocat" } };
      if (url.includes("/memberships/")) return { status: 404, body: {} };
      if (url.includes("/permission")) return { status: 500, body: {} };
      throw new Error(`unexpected fetch: ${url}`);
    });
    await expect(authorizeGitHubToken("good")).rejects.toThrow(
      /permission check failed/,
    );
  });
});
