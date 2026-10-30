import { vi } from "vitest";

const { authorizeGitHubToken } = vi.hoisted(() => ({
  authorizeGitHubToken: vi.fn(),
}));
vi.mock("@/common/github-identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/common/github-identity")>()),
  authorizeGitHubToken,
}));

import { ContentController } from "./content.controller";

beforeEach(() => {
  vi.clearAllMocks();
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
