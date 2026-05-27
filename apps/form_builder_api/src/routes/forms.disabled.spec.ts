import type { Request, Response } from "express";

jest.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
}));
jest.mock("../db.js", () => ({ getDataSource: jest.fn() }));

import { getDataSource } from "../db.js";
import { listDisabledHandler } from "./forms";

const getDataSourceMock = getDataSource as jest.Mock;

function mockRes() {
  const res = { body: undefined as unknown, statusCode: 200 } as Response & {
    body: unknown;
    statusCode: number;
  };
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

describe("GET /builder/forms/disabled", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the tombstoned form_ids as a string array", async () => {
    const ds = {
      query: jest
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
    const ds = { query: jest.fn().mockResolvedValue([]) };
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await listDisabledHandler({} as Request, res);

    expect(res.body).toEqual([]);
  });
});
