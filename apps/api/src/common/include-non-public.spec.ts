import { vi } from "vitest";
import { Logger } from "@nestjs/common";

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
  vi.restoreAllMocks();
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

  it("fails safe to public-only if verification throws, and logs why without the token", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    authorizeGitHubToken.mockRejectedValue(new Error("misconfig"));

    expect(await includeNonPublicFromAuth("Bearer gh_token")).toBe(false);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("misconfig"));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("gh_token");
  });

  it("does not log an ordinary unauthorized token", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    authorizeGitHubToken.mockResolvedValue(null);

    await includeNonPublicFromAuth("Bearer gh_token");

    expect(warn).not.toHaveBeenCalled();
  });
});
