import type { Mock } from "vitest";
/**
 * @vitest-environment node
 */
// Mock the auth surface before importing the SUT — mirrors forms.spec.ts.
vi.mock("./session-cipher.server", () => ({ getSession: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers({ cookie: "fb_session=opaque" }),
}));
vi.mock("./api-client", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

import { getSession } from "./session-cipher.server";
import { api } from "./api-client";
import { claimPresence, getPresence, releasePresence } from "./presence";

const SESSION = {
  login: "alice",
  accessToken: "gho_test_token",
  expiresAt: Date.now() + 3600_000,
};

beforeEach(() => {
  vi.resetAllMocks();
  process.env.SESSION_SECRET = Buffer.alloc(32).toString("base64");
  (getSession as Mock).mockReturnValue(SESSION);
});
afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe("claimPresence", () => {
  it("PUTs the session login to the form's presence endpoint and returns the claim", async () => {
    const apiPut = api.put as Mock;
    const claim = { held: true, holder: { userLogin: "alice" } };
    apiPut.mockResolvedValue(claim);

    const result = await claimPresence({
      data: { formId: "marriage-license" },
      context: { session: SESSION },
    } as never);

    expect(apiPut).toHaveBeenCalledWith(
      "/builder/forms/marriage-license/presence",
      { userLogin: "alice" },
    );
    expect(result).toEqual(claim);
  });

  it("URL-encodes the formId in the endpoint path", async () => {
    const apiPut = api.put as Mock;
    apiPut.mockResolvedValue({ held: false, holder: null });

    await claimPresence({
      data: { formId: "weird id/slash" },
      context: { session: SESSION },
    } as never);

    expect(apiPut.mock.calls[0][0] as string).toBe(
      "/builder/forms/weird%20id%2Fslash/presence",
    );
  });
});

describe("getPresence", () => {
  it("GETs the form's presence endpoint and returns the holder", async () => {
    const apiGet = api.get as Mock;
    const body = { holder: { userLogin: "bob" } };
    apiGet.mockResolvedValue(body);

    const result = await getPresence({
      data: { formId: "marriage-license" },
      context: { session: SESSION },
    } as never);

    expect(apiGet).toHaveBeenCalledWith(
      "/builder/forms/marriage-license/presence",
    );
    expect(result).toEqual(body);
  });
});

describe("releasePresence", () => {
  it("DELETEs with the session login so only the caller's row is released", async () => {
    const apiDel = api.del as Mock;
    apiDel.mockResolvedValue({ released: true });

    const result = await releasePresence({
      data: { formId: "marriage-license" },
      context: { session: SESSION },
    } as never);

    expect(apiDel).toHaveBeenCalledWith(
      "/builder/forms/marriage-license/presence",
      { userLogin: "alice" },
    );
    expect(result).toEqual({ released: true });
  });
});
