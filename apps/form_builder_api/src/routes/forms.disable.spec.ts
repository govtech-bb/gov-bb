import type { Request, Response } from "express";

// routes/forms.ts imports FormDefinitionEntity (used only by the POST handler).
// Stub it so loading the module doesn't drag in the full TypeORM entity graph.
jest.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
}));

// The DataSource is the unit under control: mock the accessor so each test
// drives a fake query layer.
jest.mock("../db.js", () => ({ getDataSource: jest.fn() }));

import { getDataSource } from "../db.js";
import { disableFormHandler } from "./forms";

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

function fakeDataSource() {
  const ds = {
    query: jest.fn(async () => []),
  };
  return { ds };
}

function sqlsOf(ds: { query: jest.Mock }): string[] {
  return ds.query.mock.calls.map((call) => call[0] as string);
}

describe("POST /builder/forms/:formId/disable", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("body validation (zod)", () => {
    it.each([
      ["missing reason", { disabledBy: "alice" }],
      ["empty reason", { reason: "", disabledBy: "alice" }],
      ["missing disabledBy", { reason: "cleanup" }],
      ["empty disabledBy", { reason: "cleanup", disabledBy: "" }],
    ])("rejects %s with 400 and never queries the DB", async (_label, body) => {
      const { ds } = fakeDataSource();
      getDataSourceMock.mockResolvedValue(ds);
      const res = mockRes();

      await disableFormHandler(mockReq({ formId: "passport" }, body), res);

      expect(res.statusCode).toBe(400);
      expect(ds.query).not.toHaveBeenCalled();
    });
  });

  it("upserts a tombstone parameterised as (form_id, reason, disabled_by) and returns ok", async () => {
    const { ds } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await disableFormHandler(
      mockReq(
        { formId: "passport" },
        { reason: "duplicate", disabledBy: "alice" },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const insertCall = ds.query.mock.calls.find((call) =>
      /INSERT INTO form_disabled_overrides/i.test(call[0] as string),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall?.[1]).toEqual(["passport", "duplicate", "alice"]);
  });

  it("is idempotent: re-disable uses ON CONFLICT and returns 200", async () => {
    const { ds } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await disableFormHandler(
      mockReq({ formId: "passport" }, { reason: "again", disabledBy: "bob" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(sqlsOf(ds).some((s) => /ON CONFLICT/i.test(s))).toBe(true);
  });
});
