jest.mock("./session", () => ({
  __esModule: true,
  getBuilderSession: jest.fn(),
}));

import {
  ForbiddenError,
  UnauthorizedError,
  requirePublisher,
  requireSession,
} from "./auth-middleware";
import { getBuilderSession } from "./session";

const mockedGetSession = getBuilderSession as jest.MockedFunction<
  typeof getBuilderSession
>;

function mockSession(data: Record<string, unknown>) {
  mockedGetSession.mockResolvedValue({
    id: undefined,
    data,
    update: jest.fn(),
    clear: jest.fn(),
  } as unknown as Awaited<ReturnType<typeof getBuilderSession>>);
}

describe("requireSession", () => {
  beforeEach(() => {
    mockedGetSession.mockReset();
  });

  it("throws UnauthorizedError when the session is empty", async () => {
    mockSession({});
    await expect(requireSession()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError when the session is expired", async () => {
    mockSession({
      githubLogin: "alice",
      accessToken: "tok",
      teamMemberships: [],
      expiresAt: Date.now() - 1_000,
    });
    await expect(requireSession()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("returns session data when valid", async () => {
    mockSession({
      githubLogin: "alice",
      accessToken: "tok",
      teamMemberships: ["publishers"],
      expiresAt: Date.now() + 60_000,
    });
    const data = await requireSession();
    expect(data.githubLogin).toBe("alice");
    expect(data.teamMemberships).toEqual(["publishers"]);
  });
});

describe("requirePublisher", () => {
  const originalEnv = process.env.GITHUB_PUBLISH_TEAM_SLUG;

  beforeEach(() => {
    mockedGetSession.mockReset();
    process.env.GITHUB_PUBLISH_TEAM_SLUG = "publishers";
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.GITHUB_PUBLISH_TEAM_SLUG;
    } else {
      process.env.GITHUB_PUBLISH_TEAM_SLUG = originalEnv;
    }
  });

  it("throws UnauthorizedError when no session", async () => {
    mockSession({});
    await expect(requirePublisher()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws ForbiddenError when session lacks publish-team membership", async () => {
    mockSession({
      githubLogin: "alice",
      accessToken: "tok",
      teamMemberships: ["readers"],
      expiresAt: Date.now() + 60_000,
    });
    await expect(requirePublisher()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns session data when the user is in the publish team", async () => {
    mockSession({
      githubLogin: "alice",
      accessToken: "tok",
      teamMemberships: ["publishers", "readers"],
      expiresAt: Date.now() + 60_000,
    });
    const data = await requirePublisher();
    expect(data.githubLogin).toBe("alice");
  });

  it("throws if GITHUB_PUBLISH_TEAM_SLUG is unset", async () => {
    delete process.env.GITHUB_PUBLISH_TEAM_SLUG;
    mockSession({
      githubLogin: "alice",
      accessToken: "tok",
      teamMemberships: ["publishers"],
      expiresAt: Date.now() + 60_000,
    });
    await expect(requirePublisher()).rejects.toThrow(
      /GITHUB_PUBLISH_TEAM_SLUG/,
    );
  });
});
