import type { Mock } from "vitest";
import type { Request, Response } from "express";

vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));
vi.mock("./presence.js", () => ({ holdsFreshClaim: vi.fn() }));
// The #759 recipe-validation backstop runs before the presence check; stub it
// as passing so these tests exercise the presence gate, not validation.
vi.mock("./validate-recipe.js", () => ({
  validateRecipeFully: vi.fn().mockResolvedValue({ ok: true }),
}));

import { getDataSource } from "../db.js";
import { holdsFreshClaim } from "./presence.js";
import { publishHandler } from "./publish";

const getDataSourceMock = getDataSource as Mock;
const holdsFreshClaimMock = holdsFreshClaim as Mock;

function mockReq(body: unknown): Request {
  return { body, params: {} } as unknown as Request;
}
function mockRes() {
  const res = { statusCode: 200, body: undefined as unknown };
  (res as any).status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  (res as any).json = (payload: unknown) => {
    res.body = payload;
    return res;
  };
  return res as typeof res & Response;
}

const recipe = { formId: "marriage-license", version: "1.0.0", title: "M" };

const originalFetch = global.fetch;
beforeEach(() => {
  getDataSourceMock.mockResolvedValue({ query: vi.fn() });
  holdsFreshClaimMock.mockReset();
  // Fail loudly if the gate ever lets a non-holder reach GitHub.
  global.fetch = vi.fn(() => {
    throw new Error("fetch must not be called when the presence gate rejects");
  }) as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe("publishHandler — presence enforcement", () => {
  it("400s when userLogin is missing", async () => {
    const res = mockRes();
    await publishHandler(mockReq({ recipe, githubToken: "tok" }), res);
    expect(res.statusCode).toBe(400);
    expect(holdsFreshClaimMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("409s with code presence_conflict when the caller is not the holder", async () => {
    holdsFreshClaimMock.mockResolvedValue(false);
    const res = mockRes();
    await publishHandler(
      mockReq({ recipe, githubToken: "tok", userLogin: "bob" }),
      res,
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe("presence_conflict");
    expect(holdsFreshClaimMock).toHaveBeenCalledWith(
      expect.anything(),
      "marriage-license",
      "bob",
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("still requires recipe and githubToken before the presence check", async () => {
    const res = mockRes();
    await publishHandler(mockReq({ userLogin: "alice" }), res);
    expect(res.statusCode).toBe(400);
    expect(holdsFreshClaimMock).not.toHaveBeenCalled();
  });
});
