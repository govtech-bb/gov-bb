import type { Mock } from "vitest";
import type { Request, Response } from "express";

// forms.ts imports FormDefinitionEntity + FormConfigEntity. Stub them so loading
// the module doesn't drag in the full TypeORM entity graph.
vi.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
  FormConfigEntity: class FormConfigEntity {},
}));

vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));

// Presence (read-only lock, #874) is exercised in presence.spec.ts; here it's
// out of scope, so treat every caller as the holder and let mockReq stamp a
// userLogin so the save handlers' presence gate is satisfied transparently.
vi.mock("./presence.js", () => ({
  holdsFreshClaim: vi.fn().mockResolvedValue(true),
}));

import { getDataSource } from "../db.js";
import {
  createFormHandler,
  updateFormHandler,
  getFormConfigHandler,
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
});

// A DataSource whose `transaction` runs the callback against a fake manager.
// `configUpsert` captures the form_config upsert; `formConfigRows` feeds the
// GET .../config lookup. The recipe save path goes through repos keyed by
// entity name. `managerConfigRow` is the row the transaction's FormConfigEntity
// repo returns from findOne (the existing blob the processors merge reads).
function fakeDataSource(
  opts: { formConfigRows?: unknown[]; managerConfigRow?: unknown } = {},
) {
  const { formConfigRows = [], managerConfigRow = null } = opts;
  const configUpsert = vi.fn(async () => undefined);
  const formDefSave = vi.fn(async (e: unknown) => e);
  // The in-transaction form_config repo's findOne — the existing-blob read the
  // processors merge does before writing. Distinct from the GET path's findOne.
  const managerConfigFindOne = vi.fn(async () => managerConfigRow);

  // Repo factory for the live (non-transaction) DataSource — used by the GET
  // .../config lookup.
  function repoFor(entity: any) {
    if (entity?.name === "FormConfigEntity") {
      return {
        upsert: configUpsert,
        findOne: vi.fn(async () => formConfigRows[0] ?? null),
      };
    }
    return {
      findOne: vi.fn(async () => null),
      create: vi.fn((e: unknown) => e),
      save: formDefSave,
    };
  }

  // Repo factory for the transaction manager: the FormConfigEntity repo here
  // captures the merge read (managerConfigFindOne) and the upsert (configUpsert,
  // shared so existing mdaContactId assertions still see the call).
  function managerRepoFor(entity: any) {
    if (entity?.name === "FormConfigEntity") {
      return {
        upsert: configUpsert,
        findOne: managerConfigFindOne,
      };
    }
    return {
      findOne: vi.fn(async () => null),
      create: vi.fn((e: unknown) => e),
      save: formDefSave,
    };
  }

  const manager = {
    getRepository: vi.fn(managerRepoFor),
    query: vi.fn(async () => []),
  };

  const query = vi.fn(async (sql: string) => {
    if (/DISTINCT ON \(form_id\)/i.test(sql)) return [];
    if (/SELECT 1 FROM form_definitions WHERE form_id/i.test(sql)) return [];
    // PUT row lookup (#1196: one row per form, keyed by formId)
    if (/SELECT id FROM form_definitions WHERE form_id/i.test(sql))
      return [{ id: 7 }];
    return [];
  });

  const ds = {
    getRepository: vi.fn(repoFor),
    query,
    transaction: vi.fn(async (cb: (m: typeof manager) => unknown) =>
      cb(manager),
    ),
  };
  return {
    ds,
    manager,
    configUpsert,
    managerConfigFindOne,
    formDefSave,
    query,
  };
}

// A minimal valid author-time payment processor for the merge/validate tests.
function paymentProcessor(over: Record<string, unknown> = {}) {
  return {
    type: "payment",
    config: {
      provider: "ezpay",
      department: "registry",
      paymentCode: "MARRIAGE",
      amount: 100,
      description: "Marriage license fee",
      customerEmailPath: "step-1.email",
      customerNamePath: "step-1.name",
      ...over,
    },
  };
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
    expect(res.body).toEqual({ mdaContactId: "c-1", processors: null });
  });

  it("returns null mdaContactId when no row exists", async () => {
    const { ds } = fakeDataSource({ formConfigRows: [] });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await getFormConfigHandler(mockReq({}, { formId: "no-config-form" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ mdaContactId: null, processors: null });
  });

  it("returns the stored processors from config.processors when present", async () => {
    const procs = [paymentProcessor()];
    const { ds } = fakeDataSource({
      formConfigRows: [
        {
          formId: "marriage-license",
          mdaContactId: null,
          config: { processors: procs },
        },
      ],
    });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await getFormConfigHandler(
      mockReq({}, { formId: "marriage-license" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ mdaContactId: null, processors: procs });
  });

  it("returns null processors when the row has a config without processors", async () => {
    const { ds } = fakeDataSource({
      formConfigRows: [
        {
          formId: "marriage-license",
          mdaContactId: "c-1",
          config: { somethingElse: true },
        },
      ],
    });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await getFormConfigHandler(
      mockReq({}, { formId: "marriage-license" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ mdaContactId: "c-1", processors: null });
  });

  it("returns 500 on a DB error", async () => {
    getDataSourceMock.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await getFormConfigHandler(mockReq({}, { formId: "x" }), res);
    expect(res.statusCode).toBe(500);
  });
});

describe("createFormHandler — processors blob merge", () => {
  it("upserts processors into form_config.config when a non-empty array is given", async () => {
    const procs = [paymentProcessor()];
    const { ds, configUpsert } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(
      mockReq({ recipe: recipe(), isNew: true, processors: procs }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(configUpsert).toHaveBeenCalledWith(
      { formId: "marriage-license", config: { processors: procs } },
      ["formId"],
    );
  });

  it("merges processors into an existing config blob, preserving unknown keys", async () => {
    const procs = [paymentProcessor()];
    const { ds, configUpsert } = fakeDataSource({
      managerConfigRow: {
        formId: "marriage-license",
        config: { futureFlag: 42, processors: [{ type: "stale" }] },
      },
    });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(
      mockReq({ recipe: recipe(), isNew: true, processors: procs }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(configUpsert).toHaveBeenCalledWith(
      {
        formId: "marriage-license",
        config: { futureFlag: 42, processors: procs },
      },
      ["formId"],
    );
  });

  it("clears the processors key (preserving the rest of the blob) on an empty array", async () => {
    const { ds, configUpsert } = fakeDataSource({
      managerConfigRow: {
        formId: "marriage-license",
        config: { futureFlag: 7, processors: [paymentProcessor()] },
      },
    });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(
      mockReq({ recipe: recipe(), isNew: true, processors: [] }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(configUpsert).toHaveBeenCalledWith(
      { formId: "marriage-license", config: { futureFlag: 7 } },
      ["formId"],
    );
  });

  it("clears the processors key on an explicit null", async () => {
    const { ds, configUpsert } = fakeDataSource({
      managerConfigRow: {
        formId: "marriage-license",
        config: { processors: [paymentProcessor()] },
      },
    });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(
      mockReq({ recipe: recipe(), isNew: true, processors: null }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(configUpsert).toHaveBeenCalledWith(
      { formId: "marriage-license", config: {} },
      ["formId"],
    );
  });

  it("leaves the config blob untouched when processors is absent", async () => {
    const { ds, configUpsert, managerConfigFindOne } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(mockReq({ recipe: recipe(), isNew: true }), res);

    expect(res.statusCode).toBe(201);
    // No processors read and no config upsert when the sibling is absent.
    expect(managerConfigFindOne).not.toHaveBeenCalled();
    expect(configUpsert).not.toHaveBeenCalled();
  });

  it("rejects an invalid processors array with a 4xx and writes nothing", async () => {
    const { ds, configUpsert, formDefSave } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(
      mockReq({
        recipe: recipe(),
        isNew: true,
        // Missing required payment fields => schema rejects.
        processors: [{ type: "payment", config: { provider: "ezpay" } }],
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    // Transaction atomicity: nothing else was written.
    expect(formDefSave).not.toHaveBeenCalled();
    expect(configUpsert).not.toHaveBeenCalled();
    expect(ds.transaction).not.toHaveBeenCalled();
  });

  it("rejects a non-payment processor in the sibling with a 400 and writes nothing", async () => {
    const { ds, configUpsert, formDefSave } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(
      mockReq({
        recipe: recipe(),
        isNew: true,
        // A valid email processor — but only payment processors may live in the
        // DB blob (a non-payment entry would double-execute at hydration).
        processors: [
          { type: "email", config: { recipientField: "applicant.email" } },
        ],
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(formDefSave).not.toHaveBeenCalled();
    expect(configUpsert).not.toHaveBeenCalled();
    expect(ds.transaction).not.toHaveBeenCalled();
  });
});

describe("updateFormHandler — processors blob merge", () => {
  it("upserts processors into form_config.config when a non-empty array is given", async () => {
    const procs = [paymentProcessor()];
    const { ds, configUpsert } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await updateFormHandler(
      mockReq(
        { recipe: recipe(), processors: procs },
        { formId: "marriage-license" },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(configUpsert).toHaveBeenCalledWith(
      { formId: "marriage-license", config: { processors: procs } },
      ["formId"],
    );
  });

  it("rejects an invalid processors array with a 4xx and writes nothing", async () => {
    const { ds, configUpsert } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await updateFormHandler(
      mockReq(
        { recipe: recipe(), processors: [{ type: "payment", config: {} }] },
        { formId: "marriage-license" },
      ),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(configUpsert).not.toHaveBeenCalled();
    expect(ds.transaction).not.toHaveBeenCalled();
  });

  it("rejects a non-payment processor in the sibling with a 400 and writes nothing", async () => {
    const { ds, configUpsert } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await updateFormHandler(
      mockReq(
        {
          recipe: recipe(),
          processors: [
            { type: "email", config: { recipientField: "applicant.email" } },
          ],
        },
        { formId: "marriage-license" },
      ),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(configUpsert).not.toHaveBeenCalled();
    expect(ds.transaction).not.toHaveBeenCalled();
  });

  it("clears the processors key on an empty array", async () => {
    const { ds, configUpsert } = fakeDataSource({
      managerConfigRow: {
        formId: "marriage-license",
        config: { processors: [paymentProcessor()] },
      },
    });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await updateFormHandler(
      mockReq(
        { recipe: recipe(), processors: [] },
        { formId: "marriage-license" },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(configUpsert).toHaveBeenCalledWith(
      { formId: "marriage-license", config: {} },
      ["formId"],
    );
  });
});
