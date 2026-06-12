import type { Mock } from "vitest";
import type { Request, Response } from "express";

vi.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
}));
vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));

import { getDataSource } from "../db.js";
import { listDisabledHandler } from "./forms";

const getDataSourceMock = getDataSource as Mock;

function mockRes() {
  const res = { body: undefined as unknown, statusCode: 200 } as Response & {
    body: unknown;
    statusCode: number;
  };
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

describe("GET /builder/forms/disabled", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the tombstoned form_ids as a string array", async () => {
    const ds = {
      query: vi
        .fn()
        .mockResolvedValue([{ form_id: "passport" }, { form_id: "licence" }]),
    };
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await listDisabledHandler({} as Request, res);

    expect(ds.query).toHaveBeenCalledWith(
      expect.stringMatching(/SELECT form_id FROM form_disabled_overrides/i),
    );
    expect(res.body).toEqual(["passport", "licence"]);
  });

  it("returns an empty array when nothing is tombstoned", async () => {
    const ds = { query: vi.fn().mockResolvedValue([]) };
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await listDisabledHandler({} as Request, res);

    expect(res.body).toEqual([]);
  });
});
