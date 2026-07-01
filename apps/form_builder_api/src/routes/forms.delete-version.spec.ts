import type { Mock } from "vitest";
import type { Request, Response } from "express";

// routes/forms.ts imports FormDefinitionEntity (used only by the POST handler).
// Stub it so loading the module doesn't drag in the full TypeORM entity graph.
vi.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
}));

// The DataSource is the unit under control: mock the accessor so each test
// drives a fake query layer.
vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));

import { getDataSource } from "../db.js";
import { HttpError } from "../lib/http-error";
import { deleteFormVersionHandler } from "./forms";

const getDataSourceMock = getDataSource as Mock;

function mockReq(params: Record<string, string>): Request {
  return { params } as unknown as Request;
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
 * Build a fake DataSource whose `query` answers by matching the SQL: the SELECT
 * returns `select`, the DELETE returns `deleted`. A test stages which rows each
 * statement returns.
 */
function fakeDataSource(
  rows: { select?: unknown[]; deleted?: unknown[] } = {},
) {
  const { select = [], deleted = [] } = rows;
  const ds = {
    query: vi.fn(async (sql: string) => {
      if (/^\s*SELECT/i.test(sql)) return select;
      if (/DELETE FROM form_definitions/i.test(sql)) return deleted;
      return [];
    }),
  };
  return { ds };
}

function sqlsOf(ds: { query: Mock }): string[] {
  return ds.query.mock.calls.map((call) => call[0] as string);
}

describe("DELETE /builder/forms/:formId/versions/:version", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws a 404 HttpError and deletes nothing when no row matches form_id + version", async () => {
    const { ds } = fakeDataSource({ select: [] });
    getDataSourceMock.mockResolvedValue(ds);

    const err = await deleteFormVersionHandler(
      mockReq({ formId: "apply-for-conductor-licence", version: "1.1.0" }),
      mockRes(),
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
    expect(
      sqlsOf(ds).some((s) => /DELETE FROM form_definitions/i.test(s)),
    ).toBe(false);
  });

  it("throws a 400 HttpError when refusing to delete a published row, matching the PUT guard", async () => {
    const { ds } = fakeDataSource({
      select: [{ id: "v1", published_at: "2026-01-01T00:00:00Z" }],
    });
    getDataSourceMock.mockResolvedValue(ds);

    const err = await deleteFormVersionHandler(
      mockReq({ formId: "apply-for-conductor-licence", version: "1.3.0" }),
      mockRes(),
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
    expect(
      sqlsOf(ds).some((s) => /DELETE FROM form_definitions/i.test(s)),
    ).toBe(false);
  });

  it("deletes the single matching draft row and returns ok, without tombstoning", async () => {
    const { ds } = fakeDataSource({
      select: [{ id: "v1", published_at: null }],
      deleted: [{ id: "v1" }],
    });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await deleteFormVersionHandler(
      mockReq({ formId: "apply-for-conductor-licence", version: "1.1.0" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const sqls = sqlsOf(ds);
    // The DELETE targets exactly one row (by id), not every version of the form.
    const deleteCall = ds.query.mock.calls.find((c) =>
      /DELETE FROM form_definitions/i.test(c[0] as string),
    );
    expect(deleteCall?.[1]).toEqual(["v1"]);

    // No tombstone — form_disabled_overrides is never touched.
    expect(sqls.some((s) => /form_disabled_overrides/i.test(s))).toBe(false);
  });
});
