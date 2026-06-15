import type { Mock } from "vitest";
import type { Request, Response } from "express";

// routes/forms.ts imports FormDefinitionEntity (used only by the POST handler).
// Stub it so loading the module doesn't drag in the full TypeORM entity graph.
vi.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
}));

// The DataSource is the unit under control: mock the accessor so each test
// drives a fake transactional manager.
vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));

import { getDataSource } from "../db.js";
import { deleteFormHandler } from "./forms";

const getDataSourceMock = getDataSource as Mock;

function mockReq(params: Record<string, string>, body?: unknown): Request {
  return { params, body } as unknown as Request;
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

/**
 * Build a fake DataSource whose `transaction` runs the callback against a
 * fake EntityManager. `manager.query` answers by matching the SQL so a test
 * can stage which rows the DELETE returns.
 */
function fakeDataSource(rows: { deleted?: unknown[] } = {}) {
  const { deleted = [] } = rows;
  const manager = {
    query: vi.fn(async (sql: string) => {
      if (/DELETE FROM form_definitions/i.test(sql)) return deleted;
      return [];
    }),
  };
  const ds = {
    query: vi.fn(),
    transaction: vi.fn(async (cb: (m: typeof manager) => Promise<unknown>) =>
      cb(manager),
    ),
  };
  return { ds, manager };
}

function sqlsOf(manager: { query: Mock }): string[] {
  return manager.query.mock.calls.map((call) => call[0] as string);
}

describe("DELETE /builder/forms/:formId (draft delete)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 and never reads or writes form_disabled_overrides when no versions exist", async () => {
    const { ds, manager } = fakeDataSource({ deleted: [] });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await deleteFormHandler(mockReq({ formId: "ghost" }), res);

    expect(res.statusCode).toBe(404);

    const sqls = sqlsOf(manager);
    // form_disabled_overrides must never be consulted at all.
    expect(sqls.some((s) => /form_disabled_overrides/i.test(s))).toBe(false);
  });

  it("deletes all versions and returns the count, never touching overrides or submissions", async () => {
    const { ds, manager } = fakeDataSource({
      deleted: [{ id: "v1" }, { id: "v2" }],
    });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await deleteFormHandler(mockReq({ formId: "passport" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, deletedVersions: 2 });

    const sqls = sqlsOf(manager);
    expect(sqls.some((s) => /DELETE FROM form_definitions/i.test(s))).toBe(
      true,
    );
    // No tombstone read or write.
    expect(sqls.some((s) => /form_disabled_overrides/i.test(s))).toBe(false);
    // Submitted data is never referenced.
    expect(sqls.some((s) => /form_submissions/i.test(s))).toBe(false);
  });
});
