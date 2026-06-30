import type { Mock } from "vitest";
import type { Request, Response } from "express";

// Stub the entity so loading routes/forms.ts doesn't drag in the TypeORM graph.
vi.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
  FormConfigEntity: class FormConfigEntity {},
}));

// getDataSource is the boundary we assert against: a rejected recipe must be a
// 400 BEFORE any DB access, so getDataSource must never be called for those.
vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));

vi.mock("./presence.js", () => ({
  holdsFreshClaim: vi.fn().mockResolvedValue(true),
}));

import { getDataSource } from "../db.js";
import { createFormHandler, updateFormHandler } from "./forms";

const getDataSourceMock = getDataSource as Mock;

function mockReq(body: unknown, params: Record<string, string> = {}): Request {
  const withLogin =
    body && typeof body === "object" && !Array.isArray(body)
      ? { userLogin: "tester", ...(body as Record<string, unknown>) }
      : body;
  return { params, body: withLogin } as unknown as Request;
}

interface CapturingResponse extends Response {
  statusCode: number;
  body: unknown;
}

function mockRes(): CapturingResponse {
  const res = { statusCode: 200, body: undefined } as CapturingResponse;
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response["status"];
  res.json = vi.fn((payload: unknown) => {
    res.body = payload;
    return res;
  }) as unknown as Response["json"];
  return res;
}

const BASE = {
  formId: "test-form",
  title: "Test Form",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  steps: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  // If a test gets past validation, fail fast (we only assert validation here).
  getDataSourceMock.mockRejectedValue(new Error("DB reached"));
});

describe("recipe validation on save (#281)", () => {
  const malicious = {
    ...BASE,
    processors: [
      {
        type: "opencrvs",
        config: { endpoint: "https://169.254.169.254/latest/meta-data/" },
      },
    ],
  };

  it("createFormHandler rejects a recipe whose processor endpoint is an internal IP — 400, no DB access", async () => {
    const res = mockRes();
    await createFormHandler(mockReq({ recipe: malicious, isNew: true }), res);

    expect(res.statusCode).toBe(400);
    expect(getDataSourceMock).not.toHaveBeenCalled();
  });

  it("updateFormHandler rejects the same recipe — 400, no DB access", async () => {
    const res = mockRes();
    await updateFormHandler(
      mockReq({ recipe: malicious }, { formId: "test-form" }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(getDataSourceMock).not.toHaveBeenCalled();
  });

  it("createFormHandler rejects a non-https webhook url — 400, no DB access", async () => {
    const res = mockRes();
    await createFormHandler(
      mockReq({
        recipe: {
          ...BASE,
          processors: [
            { type: "webhook", config: { url: "http://hooks.example/x" } },
          ],
        },
        isNew: true,
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(getDataSourceMock).not.toHaveBeenCalled();
  });

  it("allows a recipe with no processors (does not 400 at the processor gate)", async () => {
    const res = mockRes();
    // A schema-valid recipe with no `processors` key. The processor gate must
    // not reject it (nothing to validate); it proceeds to the DB layer
    // (#281 fallback B — processors-only validation). Note: the draft must
    // still satisfy draftRecipeSchema (the save-path schema gate), so this uses
    // BASE rather than a bare formId/title.
    await createFormHandler(
      mockReq({
        recipe: BASE,
        isNew: true,
      }),
      res,
    );

    expect(getDataSourceMock).toHaveBeenCalled();
  });

  it("a valid recipe (empty steps, safe processor) passes validation and reaches the DB layer", async () => {
    const res = mockRes();
    await createFormHandler(
      mockReq({
        recipe: {
          ...BASE,
          processors: [
            {
              type: "opencrvs",
              config: { endpoint: "https://opencrvs.example.gov.bb/submit" },
            },
          ],
        },
        isNew: true,
      }),
      res,
    );

    // Validation passed → the handler proceeded to getDataSource (which our mock
    // rejects). The point is it did NOT 400 at the validation gate.
    expect(getDataSourceMock).toHaveBeenCalled();
  });
});
