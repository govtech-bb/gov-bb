import { vi } from "vitest";

const { authorizeGitHubToken } = vi.hoisted(() => ({
  authorizeGitHubToken: vi.fn(),
}));
vi.mock("@/common/github-identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/common/github-identity")>()),
  authorizeGitHubToken,
}));

import { includeNonPublicFromAuth } from "./include-non-public";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("includeNonPublicFromAuth", () => {
  it("returns false when there is no bearer token (public-only)", async () => {
    expect(await includeNonPublicFromAuth(undefined)).toBe(false);
    expect(authorizeGitHubToken).not.toHaveBeenCalled();
  });

  it("returns true when the forwarded GitHub token is authorized", async () => {
    authorizeGitHubToken.mockResolvedValue("octocat");
    expect(await includeNonPublicFromAuth("Bearer gh_token")).toBe(true);
    expect(authorizeGitHubToken).toHaveBeenCalledWith("gh_token");
  });

  it("returns false when the token is not authorized", async () => {
    authorizeGitHubToken.mockResolvedValue(null);
    expect(await includeNonPublicFromAuth("Bearer gh_token")).toBe(false);
  });

  it("fails safe to public-only if verification throws", async () => {
    authorizeGitHubToken.mockRejectedValue(new Error("misconfig"));
    expect(await includeNonPublicFromAuth("Bearer gh_token")).toBe(false);
  });
});
