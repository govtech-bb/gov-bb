import type { Request, Response } from "express";

// forms.ts imports FormDefinitionEntity + FormConfigEntity. Stub them so loading
// the module doesn't drag in the full TypeORM entity graph.
jest.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
  FormConfigEntity: class FormConfigEntity {},
}));

jest.mock("../db.js", () => ({ getDataSource: jest.fn() }));

import { getDataSource } from "../db.js";
import {
  createFormHandler,
  updateFormHandler,
  getFormConfigHandler,
} from "./forms";

const getDataSourceMock = getDataSource as jest.Mock;

function mockReq(body: unknown, params: Record<string, string> = {}): Request {
  return { body, params } as unknown as Request;
}

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

function recipe(over: Record<string, unknown> = {}) {
  return {
    formId: "marriage-license",
    version: "1.0.0",
    title: "Marriage License",
    ...over,
  };
}

// Default fetch to "no published forms" so the uniqueness backstop doesn't
// interfere with config tests.
const originalFetch = global.fetch;
const originalApiBaseUrl = process.env.API_BASE_URL;

beforeEach(() => {
  process.env.API_BASE_URL = "http://api.test";
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ data: [] }),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalApiBaseUrl === undefined) delete process.env.API_BASE_URL;
  else process.env.API_BASE_URL = originalApiBaseUrl;
});

// A DataSource whose `transaction` runs the callback against a fake manager.
// `configUpsert` captures the form_config upsert; `formConfigRows` feeds the
// GET .../config lookup. The recipe save path goes through repos keyed by
// entity name.
function fakeDataSource(opts: { formConfigRows?: unknown[] } = {}) {
  const { formConfigRows = [] } = opts;
  const configUpsert = jest.fn(async () => undefined);
  const formDefSave = jest.fn(async (e: unknown) => e);

  // Repo factory keyed off the entity's class name so the recipe path and the
  // form_config path get distinct fakes.
  function repoFor(entity: any) {
    if (entity?.name === "FormConfigEntity") {
      return {
        upsert: configUpsert,
        findOne: jest.fn(async () => formConfigRows[0] ?? null),
      };
    }
    return {
      findOne: jest.fn(async () => null),
      create: jest.fn((e: unknown) => e),
      save: formDefSave,
    };
  }

  const manager = {
    getRepository: jest.fn(repoFor),
    query: jest.fn(async () => []),
  };

  const query = jest.fn(async (sql: string) => {
    if (/DISTINCT ON \(form_id\)/i.test(sql)) return [];
    if (/SELECT 1 FROM form_definitions WHERE form_id/i.test(sql)) return [];
    // PUT latest-version lookup
    if (/SELECT id, version, published_at/i.test(sql))
      return [{ id: 7, version: "1.0.0", published_at: null }];
    return [];
  });

  const ds = {
    getRepository: jest.fn(repoFor),
    query,
    transaction: jest.fn(async (cb: (m: typeof manager) => unknown) =>
      cb(manager),
    ),
  };
  return { ds, manager, configUpsert, formDefSave, query };
}

describe("createFormHandler — form_config upsert", () => {
  it("upserts form_config in the same transaction when mdaContactId is given", async () => {
    const { ds, configUpsert, formDefSave } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(
      mockReq({
        recipe: recipe(),
        isNew: true,
        mdaContactId: "contact-123",
      }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(ds.transaction).toHaveBeenCalled();
    expect(formDefSave).toHaveBeenCalled();
    expect(configUpsert).toHaveBeenCalledWith(
      { formId: "marriage-license", mdaContactId: "contact-123" },
      ["formId"],
    );
  });

  it("upserts a null mdaContactId when explicitly provided as null", async () => {
    const { ds, configUpsert } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(
      mockReq({ recipe: recipe(), isNew: true, mdaContactId: null }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(configUpsert).toHaveBeenCalledWith(
      { formId: "marriage-license", mdaContactId: null },
      ["formId"],
    );
  });

  it("leaves form_config untouched when mdaContactId is absent", async () => {
    const { ds, configUpsert, formDefSave } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(mockReq({ recipe: recipe(), isNew: true }), res);

    expect(res.statusCode).toBe(201);
    expect(formDefSave).toHaveBeenCalled();
    expect(configUpsert).not.toHaveBeenCalled();
  });
});

describe("updateFormHandler — form_config upsert", () => {
  it("upserts form_config in the same transaction when mdaContactId is given", async () => {
    const { ds, configUpsert } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await updateFormHandler(
      mockReq(
        { recipe: recipe(), mdaContactId: "contact-456" },
        { formId: "marriage-license" },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(ds.transaction).toHaveBeenCalled();
    expect(configUpsert).toHaveBeenCalledWith(
      { formId: "marriage-license", mdaContactId: "contact-456" },
      ["formId"],
    );
  });

  it("leaves form_config untouched when mdaContactId is absent", async () => {
    const { ds, configUpsert } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await updateFormHandler(
      mockReq({ recipe: recipe() }, { formId: "marriage-license" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(configUpsert).not.toHaveBeenCalled();
  });
});

describe("getFormConfigHandler", () => {
  it("returns the stored mdaContactId when a row exists", async () => {
    const { ds } = fakeDataSource({
      formConfigRows: [{ formId: "marriage-license", mdaContactId: "c-1" }],
    });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await getFormConfigHandler(
      mockReq({}, { formId: "marriage-license" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ mdaContactId: "c-1" });
  });

  it("returns null mdaContactId when no row exists", async () => {
    const { ds } = fakeDataSource({ formConfigRows: [] });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await getFormConfigHandler(mockReq({}, { formId: "no-config-form" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ mdaContactId: null });
  });

  it("returns 500 on a DB error", async () => {
    getDataSourceMock.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await getFormConfigHandler(mockReq({}, { formId: "x" }), res);
    expect(res.statusCode).toBe(500);
  });
});
