import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchUserInfo,
} from "./github-oauth";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.GITHUB_APP_CLIENT_ID = "client-123";
  process.env.GITHUB_APP_CLIENT_SECRET = "secret-456";
  process.env.BUILDER_BASE_URL = "https://forms.example.gov";
  process.env.GITHUB_ORG_LOGIN = "govtech-bb";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.restoreAllMocks();
});

describe("buildAuthorizeUrl", () => {
  it("builds the GitHub authorize URL with client_id, redirect_uri, state", () => {
    const url = new URL(buildAuthorizeUrl("xyz"));
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://forms.example.gov/auth/callback",
    );
    expect(url.searchParams.get("state")).toBe("xyz");
  });

  it("throws if GITHUB_APP_CLIENT_ID is unset", () => {
    delete process.env.GITHUB_APP_CLIENT_ID;
    expect(() => buildAuthorizeUrl("xyz")).toThrow(/GITHUB_APP_CLIENT_ID/);
  });

  it("throws if BUILDER_BASE_URL is unset", () => {
    delete process.env.BUILDER_BASE_URL;
    expect(() => buildAuthorizeUrl("xyz")).toThrow(/BUILDER_BASE_URL/);
  });
});

describe("exchangeCodeForToken", () => {
  it("returns accessToken and expiresAt on a successful exchange", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "abc", expires_in: 3600 }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    const before = Date.now();
    const result = await exchangeCodeForToken("the-code");
    expect(result.accessToken).toBe("abc");
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("https://github.com/login/oauth/access_token");
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
      client_id: "client-123",
      client_secret: "secret-456",
      code: "the-code",
    });
  });

  it("throws when GitHub returns an error body", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "bad_verification_code",
          error_description: "expired",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(exchangeCodeForToken("bad-code")).rejects.toThrow(
      /bad_verification_code/,
    );
  });

  it("throws on non-2xx HTTP responses", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(exchangeCodeForToken("any")).rejects.toThrow(/HTTP 500/);
  });
});

describe("fetchUserInfo", () => {
  it("returns login + slugs of teams in the configured org", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ login: "alice" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { slug: "publishers", organization: { login: "govtech-bb" } },
            { slug: "admins", organization: { login: "govtech-bb" } },
            { slug: "publishers", organization: { login: "other-org" } },
          ]),
          { status: 200 },
        ),
      );

    const info = await fetchUserInfo("tok");

    expect(info.login).toBe("alice");
    expect(info.teamMemberships).toEqual(["publishers", "admins"]);
  });

  it("tolerates a 403 from /user/teams (no org access yet)", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ login: "bob" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("", { status: 403 }));

    const info = await fetchUserInfo("tok");

    expect(info).toEqual({ login: "bob", teamMemberships: [] });
  });

  it("throws when /user fails", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(fetchUserInfo("tok")).rejects.toThrow(/HTTP 401/);
  });
});
