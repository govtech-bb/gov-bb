import {
  exchangeCodeForToken,
  fetchGitHubLogin,
  userHasRepoWriteAccess,
  userIsTeamMember,
} from "./github-oauth";

type FetchMock = jest.Mock<
  Promise<Response>,
  [RequestInfo | URL, RequestInit?]
>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lastFetch(mock: FetchMock): { url: string; init: RequestInit } {
  const call = mock.mock.calls[mock.mock.calls.length - 1];
  const url = typeof call[0] === "string" ? call[0] : call[0].toString();
  return { url, init: call[1] ?? {} };
}

describe("github-oauth helpers", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = jest.fn() as unknown as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("exchangeCodeForToken", () => {
    it("POSTs the expected payload and returns the access_token", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { access_token: "ghu_live_token" }),
      );
      const token = await exchangeCodeForToken({
        clientId: "client",
        clientSecret: "secret",
        code: "abc",
        redirectUri: "https://example.com/auth/github/callback",
      });
      expect(token).toBe("ghu_live_token");
      const { url, init } = lastFetch(fetchMock);
      expect(url).toBe("https://github.com/login/oauth/access_token");
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        client_id: "client",
        client_secret: "secret",
        code: "abc",
        redirect_uri: "https://example.com/auth/github/callback",
      });
    });

    it("throws when the response is not OK", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
      await expect(
        exchangeCodeForToken({
          clientId: "c",
          clientSecret: "s",
          code: "x",
          redirectUri: "u",
        }),
      ).rejects.toThrow(/Token exchange failed: 500/);
    });

    it("throws when GitHub returns no access_token", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          error: "bad_verification_code",
          error_description: "code expired",
        }),
      );
      await expect(
        exchangeCodeForToken({
          clientId: "c",
          clientSecret: "s",
          code: "x",
          redirectUri: "u",
        }),
      ).rejects.toThrow(/code expired/);
    });
  });

  describe("fetchGitHubLogin", () => {
    it("returns the login from /user", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { login: "alice" }));
      const login = await fetchGitHubLogin("ghu_token");
      expect(login).toBe("alice");
      const { url, init } = lastFetch(fetchMock);
      expect(url).toBe("https://api.github.com/user");
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer ghu_token",
      );
    });

    it("throws when the response is not OK", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
      await expect(fetchGitHubLogin("bad")).rejects.toThrow(
        /GET \/user failed: 401/,
      );
    });

    it("throws when the response has no login", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
      await expect(fetchGitHubLogin("t")).rejects.toThrow(/no login/);
    });
  });

  describe("userHasRepoWriteAccess", () => {
    it("returns true for write permission", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { permission: "write" }),
      );
      const ok = await userHasRepoWriteAccess({
        accessToken: "t",
        org: "govtech-bb",
        login: "alice",
      });
      expect(ok).toBe(true);
      const { url } = lastFetch(fetchMock);
      expect(url).toBe(
        "https://api.github.com/repos/govtech-bb/gov-bb/collaborators/alice/permission",
      );
    });

    it("returns true for admin permission", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { permission: "admin" }),
      );
      const ok = await userHasRepoWriteAccess({
        accessToken: "t",
        org: "govtech-bb",
        login: "a",
      });
      expect(ok).toBe(true);
    });

    it("returns false for read permission", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { permission: "read" }),
      );
      const ok = await userHasRepoWriteAccess({
        accessToken: "t",
        org: "govtech-bb",
        login: "a",
      });
      expect(ok).toBe(false);
    });

    it("returns false on 404 (not a collaborator)", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(404, {}));
      const ok = await userHasRepoWriteAccess({
        accessToken: "t",
        org: "govtech-bb",
        login: "a",
      });
      expect(ok).toBe(false);
    });

    it("returns false on 403 (token can't see the repo)", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(403, {}));
      const ok = await userHasRepoWriteAccess({
        accessToken: "t",
        org: "govtech-bb",
        login: "a",
      });
      expect(ok).toBe(false);
    });

    it("throws on other non-OK statuses", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
      await expect(
        userHasRepoWriteAccess({
          accessToken: "t",
          org: "govtech-bb",
          login: "a",
        }),
      ).rejects.toThrow(/Permission check failed: 500/);
    });

    it("URL-encodes the login", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { permission: "write" }),
      );
      await userHasRepoWriteAccess({
        accessToken: "t",
        org: "govtech-bb",
        login: "name with space",
      });
      const { url } = lastFetch(fetchMock);
      expect(url).toContain("/collaborators/name%20with%20space/permission");
    });
  });

  describe("userIsTeamMember", () => {
    it("returns true when membership state is active", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { state: "active" }));
      const ok = await userIsTeamMember({
        accessToken: "t",
        org: "govtech-bb",
        teamSlug: "form-authors",
        login: "alice",
      });
      expect(ok).toBe(true);
      const { url } = lastFetch(fetchMock);
      expect(url).toBe(
        "https://api.github.com/orgs/govtech-bb/teams/form-authors/memberships/alice",
      );
    });

    it("returns false when membership state is pending", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { state: "pending" }));
      const ok = await userIsTeamMember({
        accessToken: "t",
        org: "govtech-bb",
        teamSlug: "form-authors",
        login: "alice",
      });
      expect(ok).toBe(false);
    });

    it("returns false on 404 (not a member)", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(404, {}));
      const ok = await userIsTeamMember({
        accessToken: "t",
        org: "govtech-bb",
        teamSlug: "form-authors",
        login: "alice",
      });
      expect(ok).toBe(false);
    });

    it("returns false on 403 (token can't see the org/team)", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(403, {}));
      const ok = await userIsTeamMember({
        accessToken: "t",
        org: "govtech-bb",
        teamSlug: "form-authors",
        login: "alice",
      });
      expect(ok).toBe(false);
    });

    it("throws on other non-OK statuses", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
      await expect(
        userIsTeamMember({
          accessToken: "t",
          org: "govtech-bb",
          teamSlug: "form-authors",
          login: "alice",
        }),
      ).rejects.toThrow(/Team membership check failed: 500/);
    });

    it("URL-encodes the login segment", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { state: "active" }));
      await userIsTeamMember({
        accessToken: "t",
        org: "govtech-bb",
        teamSlug: "form-authors",
        login: "name with space",
      });
      const { url } = lastFetch(fetchMock);
      expect(url).toContain("/memberships/name%20with%20space");
    });
  });
});
