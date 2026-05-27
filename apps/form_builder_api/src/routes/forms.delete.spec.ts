import type { Request, Response } from "express";

// routes/forms.ts imports FormDefinitionEntity (used only by the POST handler).
// Stub it so loading the module doesn't drag in the full TypeORM entity graph.
jest.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
}));

// The DataSource is the unit under control: mock the accessor so each test
// drives a fake transactional manager.
jest.mock("../db.js", () => ({ getDataSource: jest.fn() }));

import { getDataSource } from "../db.js";
import { deleteFormHandler } from "./forms";

const getDataSourceMock = getDataSource as jest.Mock;

function mockReq(params: Record<string, string>, body: unknown): Request {
  return { params, body } as unknown as Request;
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

/**
 * Build a fake DataSource whose `transaction` runs the callback against a
 * fake EntityManager. `manager.query` answers by matching the SQL so a test
 * can stage which rows each statement returns.
 */
function fakeDataSource(
  rows: { defs?: unknown[]; override?: unknown[]; deleted?: unknown[] } = {},
) {
  const { defs = [], override = [], deleted = [] } = rows;
  const manager = {
    query: jest.fn(async (sql: string) => {
      if (/SELECT[\s\S]*FROM form_definitions/i.test(sql)) return defs;
      if (/SELECT[\s\S]*FROM form_disabled_overrides/i.test(sql))
        return override;
      if (/DELETE FROM form_definitions/i.test(sql)) return deleted;
      if (/INSERT INTO form_disabled_overrides/i.test(sql)) return [];
      return [];
    }),
  };
  const ds = {
    query: jest.fn(),
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) =>
      cb(manager),
    ),
  };
  return { ds, manager };
}

function sqlsOf(manager: { query: jest.Mock }): string[] {
  return manager.query.mock.calls.map((call) => call[0] as string);
}

describe("DELETE /builder/forms/:formId", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("body validation (zod)", () => {
    it.each([
      ["missing reason", { deletedBy: "alice" }],
      ["empty reason", { reason: "", deletedBy: "alice" }],
      ["missing deletedBy", { reason: "cleanup" }],
      ["empty deletedBy", { reason: "cleanup", deletedBy: "" }],
    ])(
      "rejects %s with 400 and never opens a transaction",
      async (_label, body) => {
        const { ds } = fakeDataSource();
        getDataSourceMock.mockResolvedValue(ds);
        const res = mockRes();

        await deleteFormHandler(mockReq({ formId: "passport" }, body), res);

        expect(res.statusCode).toBe(400);
        expect(ds.transaction).not.toHaveBeenCalled();
      },
    );
  });

  it("returns 404 and writes no tombstone for an unknown form", async () => {
    const { ds, manager } = fakeDataSource({ defs: [], override: [] });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await deleteFormHandler(
      mockReq({ formId: "ghost" }, { reason: "cleanup", deletedBy: "alice" }),
      res,
    );

    expect(res.statusCode).toBe(404);
    const inserts = sqlsOf(manager).filter((s) =>
      /INSERT INTO form_disabled_overrides/i.test(s),
    );
    expect(inserts).toHaveLength(0);
  });

  it("deletes all versions and upserts a tombstone in one transaction, leaving submissions untouched", async () => {
    const { ds, manager } = fakeDataSource({
      defs: [{ exists: 1 }],
      deleted: [{ id: "v1" }, { id: "v2" }, { id: "v3" }],
    });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await deleteFormHandler(
      mockReq(
        { formId: "passport" },
        { reason: "duplicate", deletedBy: "alice" },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, deletedVersions: 3 });

    // A single transaction wraps both writes.
    expect(ds.transaction).toHaveBeenCalledTimes(1);

    const sqls = sqlsOf(manager);
    expect(sqls.some((s) => /DELETE FROM form_definitions/i.test(s))).toBe(
      true,
    );
    expect(
      sqls.some((s) => /INSERT INTO form_disabled_overrides/i.test(s)),
    ).toBe(true);

    // Both writes went through the transactional manager, not the bare ds.
    expect(ds.query).not.toHaveBeenCalled();

    // Submitted data is never referenced.
    expect(sqls.some((s) => /form_submissions/i.test(s))).toBe(false);

    // Tombstone is parameterised as (form_id, reason, disabled_by).
    const insertCall = manager.query.mock.calls.find((call) =>
      /INSERT INTO form_disabled_overrides/i.test(call[0] as string),
    );
    expect(insertCall?.[1]).toEqual(["passport", "duplicate", "alice"]);
  });

  it("is idempotent: re-deleting an already-tombstoned form returns 200", async () => {
    const { ds, manager } = fakeDataSource({
      defs: [],
      override: [{ form_id: "passport" }],
      deleted: [],
    });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await deleteFormHandler(
      mockReq({ formId: "passport" }, { reason: "again", deletedBy: "bob" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, deletedVersions: 0 });
    expect(
      sqlsOf(manager).some((s) =>
        /INSERT INTO form_disabled_overrides/i.test(s),
      ),
    ).toBe(true);
  });
});
