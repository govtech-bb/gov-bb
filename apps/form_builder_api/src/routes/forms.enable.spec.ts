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
import { enableFormHandler } from "./forms";

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

function fakeDataSource(rows: { deleted?: unknown[] } = {}) {
  const { deleted = [] } = rows;
  const ds = {
    query: vi.fn(async (sql: string) => {
      if (/DELETE FROM form_disabled_overrides/i.test(sql)) return deleted;
      return [];
    }),
  };
  return { ds };
}

describe("DELETE /builder/forms/:formId/disabled", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the override row parameterised as [formId] and returns ok", async () => {
    const { ds } = fakeDataSource({ deleted: [{ form_id: "passport" }] });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await enableFormHandler(mockReq({ formId: "passport" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const deleteCall = ds.query.mock.calls.find((call) =>
      /DELETE FROM form_disabled_overrides WHERE form_id/i.test(
        call[0] as string,
      ),
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall?.[1]).toEqual(["passport"]);
  });

  it("is idempotent: returns 200 even when no override row exists", async () => {
    const { ds } = fakeDataSource({ deleted: [] });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await enableFormHandler(mockReq({ formId: "passport" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
