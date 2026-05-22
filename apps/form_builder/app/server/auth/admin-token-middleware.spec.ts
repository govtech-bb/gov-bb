import { ADMIN_TOKEN_HEADER, checkAdminToken } from "./admin-token-middleware";

describe("checkAdminToken", () => {
  const VALID_TOKEN = "a".repeat(32);

  const makeRequest = (headers: Record<string, string> = {}) =>
    ({
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? null,
      },
    }) as unknown as Request;

  it("passes through in dev when env unset, header absent", () => {
    expect(() =>
      checkAdminToken(undefined, makeRequest({}), false),
    ).not.toThrow();
  });

  it("passes through in dev when env unset, header present (header ignored)", () => {
    expect(() =>
      checkAdminToken(
        undefined,
        makeRequest({ [ADMIN_TOKEN_HEADER]: VALID_TOKEN }),
        false,
      ),
    ).not.toThrow();
  });

  it("rejects in production when env unset (server misconfigured)", () => {
    expect(() => checkAdminToken(undefined, makeRequest({}), true)).toThrow(
      /misconfigured/i,
    );
  });

  it("allows a request whose header matches the configured token", () => {
    expect(() =>
      checkAdminToken(
        VALID_TOKEN,
        makeRequest({ [ADMIN_TOKEN_HEADER]: VALID_TOKEN }),
        true,
      ),
    ).not.toThrow();
  });

  it("rejects when env set and the header is missing", () => {
    expect(() => checkAdminToken(VALID_TOKEN, makeRequest({}), true)).toThrow(
      /missing/i,
    );
  });

  it("rejects when env set and the header is the wrong length", () => {
    expect(() =>
      checkAdminToken(
        VALID_TOKEN,
        makeRequest({ [ADMIN_TOKEN_HEADER]: "a".repeat(31) }),
        true,
      ),
    ).toThrow(/invalid/i);
  });

  it("rejects when env set and the header is the right length but wrong content", () => {
    expect(() =>
      checkAdminToken(
        VALID_TOKEN,
        makeRequest({ [ADMIN_TOKEN_HEADER]: "b".repeat(32) }),
        true,
      ),
    ).toThrow(/invalid/i);
  });
});
