import type { Request, Response } from "express";

// routes/forms.ts imports FormDefinitionEntity (used by the POST handler).
// Stub it so loading the module doesn't drag in the full TypeORM entity graph.
jest.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
}));

// The DataSource is the unit under control: mock the accessor so each test
// drives a fake persistence layer.
jest.mock("../db.js", () => ({ getDataSource: jest.fn() }));

import { getDataSource } from "../db.js";
import { submitRecipeHandler, updateRecipeHandler } from "./forms";

const getDataSourceMock = getDataSource as jest.Mock;

interface CapturingResponse extends Response {
  statusCode: number;
  body: unknown;
}

function mockRes(): CapturingResponse {
  const res = { statusCode: 200, body: undefined } as CapturingResponse;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response["status"];
  res.json = jest.fn((payload: unknown) => {
    res.body = payload;
    return res;
  }) as unknown as Response["json"];
  return res;
}

function mockReq(body: unknown, params: Record<string, string> = {}): Request {
  return { body, params } as unknown as Request;
}

// Minimal recipe shell; tests inject `processors` to exercise the gate.
function makeRecipe(processors?: unknown[]) {
  return {
    formId: "apply-for-thing",
    title: "Apply for a thing",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    steps: [{ stepId: "step-1", title: "Step 1", elements: [] }],
    ...(processors !== undefined ? { processors } : {}),
  };
}

// Repository test double for the POST path (ds.getRepository(...)).
function fakeRepoDataSource() {
  const save = jest.fn(async (e: unknown) => e);
  const create = jest.fn((d: unknown) => d);
  const findOne = jest.fn(async () => null);
  const ds = { getRepository: () => ({ save, create, findOne }) };
  return { ds, save, create, findOne };
}

// Query test double for the PUT path (ds.query(...)).
function fakeQueryDataSource(
  selectRows: unknown[] = [
    { id: "row-1", version: "1.0.0", published_at: null },
  ],
) {
  const query = jest.fn(async (sql: string) => {
    if (/^\s*SELECT/i.test(sql)) return selectRows;
    return [];
  });
  return { ds: { query }, query };
}

const VALID_EMAIL = {
  type: "email",
  config: { recipientField: "contactDetails.email" },
};

describe("POST /builder/forms — processor validation gate", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects an unknown processor type with 422 and never touches the DB", async () => {
    // The core attack: a planted processor whose type isn't in the union.
    const recipe = makeRecipe([{ type: "exfiltrate", config: {} }]);
    const res = mockRes();

    await submitRecipeHandler(mockReq({ recipe }), res);

    expect(res.statusCode).toBe(422);
    expect((res.body as { error: string }).error).toMatch(/processor/i);
    expect((res.body as { issues: unknown[] }).issues.length).toBeGreaterThan(
      0,
    );
    // Gate runs before any DB work — getDataSource is never reached.
    expect(getDataSourceMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed processor config (payment missing required keys) with 422", async () => {
    const recipe = makeRecipe([{ type: "payment", config: {} }]);
    const res = mockRes();

    await submitRecipeHandler(mockReq({ recipe }), res);

    expect(res.statusCode).toBe(422);
    expect(getDataSourceMock).not.toHaveBeenCalled();
  });

  it("rejects a non-object processor entry with 422", async () => {
    const recipe = makeRecipe(["not-a-processor"]);
    const res = mockRes();

    await submitRecipeHandler(mockReq({ recipe }), res);

    expect(res.statusCode).toBe(422);
    expect(getDataSourceMock).not.toHaveBeenCalled();
  });

  it("rejects a webhook processor with a non-URL url with 422", async () => {
    const recipe = makeRecipe([
      { type: "webhook", config: { url: "not-a-url" } },
    ]);
    const res = mockRes();

    await submitRecipeHandler(mockReq({ recipe }), res);

    expect(res.statusCode).toBe(422);
    expect(getDataSourceMock).not.toHaveBeenCalled();
  });

  it("persists a recipe with valid processors UNCHANGED, preserving unrendered/extra keys", async () => {
    // ADR 0013/0014: validate-as-gate, store the original — the webhook
    // `secret` and any builder-unrendered key must survive verbatim.
    const recipe = makeRecipe([
      {
        type: "webhook",
        config: {
          url: "https://hooks.example.gov.bb/intake",
          secret: "0123456789abcdef0",
          unrenderedKey: "must-survive",
        },
      },
    ]);
    const { ds, save, create } = fakeRepoDataSource();
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await submitRecipeHandler(mockReq({ recipe }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ok: true });
    // The stored schema is the original recipe, not a Zod-parsed copy: the
    // unrendered key and secret are intact and no defaults were injected.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ schema: recipe }),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("accepts a recipe with no processors field (201)", async () => {
    const recipe = makeRecipe(); // no processors
    const { ds, save } = fakeRepoDataSource();
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await submitRecipeHandler(mockReq({ recipe }), res);

    expect(res.statusCode).toBe(201);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("lets opencrvs free-form config through the TYPE gate (SSRF host-blocking is the companion allowlist's job)", async () => {
    // Documents the boundary: opencrvs/spreadsheet configs are an arbitrary
    // Record by design, so a planted endpoint still parses here. Blocking the
    // outbound target is layered separately at processor execution time.
    const recipe = makeRecipe([
      {
        type: "opencrvs",
        config: { endpoint: "http://169.254.169.254/latest/meta-data/" },
      },
    ]);
    const { ds, save } = fakeRepoDataSource();
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await submitRecipeHandler(mockReq({ recipe }), res);

    expect(res.statusCode).toBe(201);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("still enforces the formId/version presence check (400) ahead of the gate", async () => {
    const res = mockRes();
    await submitRecipeHandler(mockReq({ recipe: { title: "x" } }), res);
    expect(res.statusCode).toBe(400);
    expect(getDataSourceMock).not.toHaveBeenCalled();
  });
});

describe("PUT /builder/forms/:formId — processor validation gate", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects malformed processors with 422 before any DB read or write", async () => {
    const recipe = makeRecipe([{ type: "exfiltrate", config: {} }]);
    const res = mockRes();

    await updateRecipeHandler(
      mockReq({ recipe }, { formId: "apply-for-thing" }),
      res,
    );

    expect(res.statusCode).toBe(422);
    // No SELECT, no UPDATE — the gate short-circuits before getDataSource.
    expect(getDataSourceMock).not.toHaveBeenCalled();
  });

  it("updates the draft and stores the original recipe when processors are valid", async () => {
    const recipe = makeRecipe([VALID_EMAIL]);
    const { ds, query } = fakeQueryDataSource();
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await updateRecipeHandler(
      mockReq({ recipe }, { formId: "apply-for-thing" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const updateCall = query.mock.calls.find((c) =>
      /UPDATE form_definitions/i.test(c[0] as string),
    );
    expect(updateCall?.[1]).toEqual([recipe, "row-1"]);
  });
});
