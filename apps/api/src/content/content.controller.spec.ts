import { vi } from "vitest";

const { authorizeGitHubToken } = vi.hoisted(() => ({
  authorizeGitHubToken: vi.fn(),
}));
vi.mock("@/common/github-identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/common/github-identity")>()),
  authorizeGitHubToken,
}));

import {
  ContentController,
  includeNonPublicFromAuth,
} from "./content.controller";

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

describe("ContentController", () => {
  it("passes the auth-derived flag to the service and wraps the response", async () => {
    authorizeGitHubToken.mockResolvedValue("octocat");
    const mockService = { list: vi.fn().mockReturnValue([{ slug: "a" }]) };
    const controller = new ContentController(mockService as never);

    const result = await controller.list("Bearer gh_token");

    expect(mockService.list).toHaveBeenCalledWith(true);
    expect(result).toMatchObject({ status: "success", data: [{ slug: "a" }] });
  });
});
