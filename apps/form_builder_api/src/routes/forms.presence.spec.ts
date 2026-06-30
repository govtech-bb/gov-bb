import type { Mock } from "vitest";
import type { Request, Response } from "express";

vi.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
  FormConfigEntity: class FormConfigEntity {},
}));
vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));
vi.mock("./presence.js", () => ({ holdsFreshClaim: vi.fn() }));

import { getDataSource } from "../db.js";
import { holdsFreshClaim } from "./presence.js";
import {
  createFormHandler,
  updateFormHandler,
  rekeyFormHandler,
} from "./forms";

const getDataSourceMock = getDataSource as Mock;
const holdsFreshClaimMock = holdsFreshClaim as Mock;

function mockReq(body: unknown, params: Record<string, string> = {}): Request {
  return { body, params } as unknown as Request;
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

function recipe() {
  return { formId: "marriage-license", version: "1.0.0", title: "Marriage" };
}

beforeEach(() => {
  // A DataSource that would let the save proceed if the gate didn't stop it,
  // so a leaked write would surface as a wrong status rather than a crash.
  getDataSourceMock.mockResolvedValue({
    getRepository: () => ({ findOne: vi.fn().mockResolvedValue(null) }),
    query: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(),
  });
  holdsFreshClaimMock.mockReset();
});

// createFormHandler enforces only for non-new saves (a new version of an
// existing form); brand-new creation (isNew) is exempt and covered separately.
describe.each([
  ["createFormHandler", createFormHandler, {} as Record<string, string>],
  ["updateFormHandler", updateFormHandler, { formId: "marriage-license" }],
])("%s — presence enforcement", (_name, handler, params) => {
  it("400s when userLogin is missing, before consulting the claim", async () => {
    const res = mockRes();
    await handler(mockReq({ recipe: recipe(), isNew: false }, params), res);
    expect(res.statusCode).toBe(400);
    expect(holdsFreshClaimMock).not.toHaveBeenCalled();
  });

  it("400s when userLogin is blank", async () => {
    const res = mockRes();
    await handler(
      mockReq({ recipe: recipe(), isNew: false, userLogin: "   " }, params),
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it("409s with code presence_conflict when the caller is not the holder", async () => {
    holdsFreshClaimMock.mockResolvedValue(false);
    const res = mockRes();
    await handler(
      mockReq({ recipe: recipe(), isNew: false, userLogin: "bob" }, params),
      res,
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe("presence_conflict");
    expect(holdsFreshClaimMock).toHaveBeenCalledWith(
      expect.anything(),
      "marriage-license",
      "bob",
    );
  });
});

describe("rekeyFormHandler — presence enforcement", () => {
  it("400s when userLogin is missing", async () => {
    const res = mockRes();
    await rekeyFormHandler(
      mockReq({ recipe: recipe() }, { formId: "old-id" }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(holdsFreshClaimMock).not.toHaveBeenCalled();
  });

  it("409s on the OLD id when the caller is not the holder", async () => {
    holdsFreshClaimMock.mockResolvedValue(false);
    const res = mockRes();
    await rekeyFormHandler(
      mockReq({ recipe: recipe(), userLogin: "bob" }, { formId: "old-id" }),
      res,
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe("presence_conflict");
    expect(holdsFreshClaimMock).toHaveBeenCalledWith(
      expect.anything(),
      "old-id",
      "bob",
    );
  });
});

describe("createFormHandler — brand-new form is exempt from the presence gate", () => {
  it("does not require userLogin or a claim when isNew is true", async () => {
    holdsFreshClaimMock.mockResolvedValue(false);
    const res = mockRes();
    await createFormHandler(
      mockReq({ recipe: recipe(), isNew: true }, {}),
      res,
    );
    // The presence gate is skipped entirely: no 400/409 from it, and the claim
    // is never consulted. (The save proceeds into the normal create path.)
    expect(holdsFreshClaimMock).not.toHaveBeenCalled();
    expect(res.statusCode).not.toBe(409);
  });
});
