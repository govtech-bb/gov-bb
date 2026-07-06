import type { Mock } from "vitest";
import type { Request, Response } from "express";

// forms.ts imports FormDefinitionEntity + FormConfigEntity. Stub them so loading
// the module doesn't drag in the full TypeORM entity graph.
vi.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
  FormConfigEntity: class FormConfigEntity {},
}));

vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));

// Presence (read-only lock, #874) is exercised in presence.spec.ts; here every
// caller is treated as the holder so the save handlers' presence gate is
// satisfied transparently.
vi.mock("./presence.js", () => ({
  holdsFreshClaim: vi.fn().mockResolvedValue(true),
}));

import { getDataSource } from "../db.js";
import {
  createFormHandler,
  updateFormHandler,
  rekeyFormHandler,
} from "./forms";

const getDataSourceMock = getDataSource as Mock;

function mockReq(body: unknown, params: Record<string, string> = {}): Request {
  const withLogin =
    body && typeof body === "object" && !Array.isArray(body)
      ? { userLogin: "tester", ...(body as Record<string, unknown>) }
      : body;
  return { body: withLogin, params } as unknown as Request;
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

// A structurally-valid draft recipe. `steps: []` and no timestamps is the
// canonical mid-edit draft draftRecipeSchema is meant to accept.
function recipe(over: Record<string, unknown> = {}) {
  return {
    formId: "marriage-license",
    title: "Marriage License",
    steps: [],
    ...over,
  };
}

// A DataSource whose happy path lets all three handlers reach success: no
// existing row to collide with (create), an existing row to update (update), an
// existing unpublished old-ID row to move (rekey), and no title collision. The
// transaction runs its callback against the same query-routing manager.
function fakeDataSource() {
  const formDefSave = vi.fn(async (e: unknown) => e);
  function repoFor() {
    return {
      findOne: vi.fn(async () => null),
      create: vi.fn((e: unknown) => e),
      save: formDefSave,
    };
  }
  const routeQuery = async (sql: string) => {
    // rekey: the old-ID row exists and is an unpublished draft.
    if (
      /SELECT id, published_at, schema FROM form_definitions WHERE form_id/i.test(
        sql,
      )
    )
      return [{ id: 1, published_at: null }];
    // id-uniqueness probes (create isNew / rekey new-ID) — nothing collides.
    if (/SELECT 1 FROM form_definitions WHERE form_id/i.test(sql)) return [];
    // update: the form's single row exists (#1196).
    if (/SELECT id FROM form_definitions WHERE form_id/i.test(sql))
      return [{ id: 7 }];
    // title-collision aggregation — no other form shares the title.
    if (/DISTINCT ON \(form_id\)/i.test(sql)) return [];
    return [];
  };
  const manager = {
    getRepository: vi.fn(repoFor),
    query: vi.fn(routeQuery),
  };
  return {
    getRepository: vi.fn(repoFor),
    query: vi.fn(routeQuery),
    transaction: vi.fn(async (cb: (m: typeof manager) => unknown) =>
      cb(manager),
    ),
  };
}

const originalFetch = global.fetch;
const originalApiBaseUrl = process.env.API_BASE_URL;

beforeEach(() => {
  process.env.API_BASE_URL = "http://api.test";
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ data: [] }),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalApiBaseUrl === undefined) delete process.env.API_BASE_URL;
  else process.env.API_BASE_URL = originalApiBaseUrl;
  getDataSourceMock.mockReset();
});

// #1499 — every /builder/forms write surface must reject a structurally-invalid
// recipe blob with a 400 before it can reach form_definitions.schema.
describe("draft recipe validation (#1499)", () => {
  describe("createFormHandler", () => {
    it("rejects a recipe whose steps is the wrong type with a 400", async () => {
      const res = mockRes();
      await createFormHandler(
        mockReq({ recipe: recipe({ steps: "nope" }) }),
        res,
      );
      expect(res.statusCode).toBe(400);
      // Never touched the DB.
      expect(getDataSourceMock).not.toHaveBeenCalled();
    });

    it("rejects a recipe missing a formId with a 400", async () => {
      const res = mockRes();
      const { formId: _f, ...noFormId } = recipe();
      await createFormHandler(mockReq({ recipe: noFormId }), res);
      expect(res.statusCode).toBe(400);
    });

    it("accepts a valid draft missing createdAt/updatedAt (lenient)", async () => {
      getDataSourceMock.mockResolvedValue(fakeDataSource());
      const res = mockRes();
      await createFormHandler(mockReq({ recipe: recipe() }), res);
      expect(res.statusCode).toBe(201);
    });
  });

  describe("updateFormHandler", () => {
    it("rejects a structurally-invalid recipe with a 400", async () => {
      const res = mockRes();
      await updateFormHandler(
        mockReq({ recipe: recipe({ steps: "nope" }) }, { formId: "x" }),
        res,
      );
      expect(res.statusCode).toBe(400);
      expect(getDataSourceMock).not.toHaveBeenCalled();
    });

    it("rejects a recipe missing a formId with a 400", async () => {
      const res = mockRes();
      const { formId: _f, ...noFormId } = recipe();
      await updateFormHandler(
        mockReq({ recipe: noFormId }, { formId: "x" }),
        res,
      );
      expect(res.statusCode).toBe(400);
    });

    it("accepts a valid draft missing createdAt/updatedAt (lenient)", async () => {
      getDataSourceMock.mockResolvedValue(fakeDataSource());
      const res = mockRes();
      await updateFormHandler(
        mockReq({ recipe: recipe() }, { formId: "marriage-license" }),
        res,
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  describe("rekeyFormHandler", () => {
    it("rejects a structurally-invalid recipe with a 400", async () => {
      const res = mockRes();
      await rekeyFormHandler(
        mockReq({ recipe: recipe({ steps: "nope" }) }, { formId: "old-id" }),
        res,
      );
      expect(res.statusCode).toBe(400);
      expect(getDataSourceMock).not.toHaveBeenCalled();
    });

    it("rejects a recipe missing a formId with a 400", async () => {
      const res = mockRes();
      const { formId: _f, ...noFormId } = recipe();
      await rekeyFormHandler(
        mockReq({ recipe: noFormId }, { formId: "old-id" }),
        res,
      );
      expect(res.statusCode).toBe(400);
      expect(getDataSourceMock).not.toHaveBeenCalled();
    });

    it("accepts a valid draft missing createdAt/updatedAt (lenient)", async () => {
      getDataSourceMock.mockResolvedValue(fakeDataSource());
      const res = mockRes();
      await rekeyFormHandler(
        mockReq({ recipe: recipe() }, { formId: "old-id" }),
        res,
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });
});
