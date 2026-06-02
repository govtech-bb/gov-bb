import type { Request, Response } from "express";
import { getCatalog } from "@govtech-bb/form-builder";

jest.mock("../catalog.js", () => ({ getFullCatalog: jest.fn() }));

import { getFullCatalog } from "../catalog.js";
import { validateHandler } from "./registry";

const getFullCatalogMock = getFullCatalog as jest.Mock;

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

function makeRecipe(elements: { ref: string }[]) {
  return {
    formId: "form-001",
    title: "Test Form",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    steps: [{ stepId: "step-1", title: "Step 1", elements }],
  };
}

describe("POST /builder/registry/validate — unknown ref check", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getFullCatalogMock.mockResolvedValue(getCatalog());
  });

  it("returns ok:false with an issue for an unknown ref", async () => {
    const recipe = makeRecipe([
      { ref: "components/text" },
      { ref: "components/this-does-not-exist" },
    ]);
    const res = mockRes();

    await validateHandler({ body: { recipe } } as Request, res);

    expect(res.body).toEqual({
      ok: false,
      issues: [
        {
          path: "steps[step-1].elements[1].ref",
          message:
            'Unknown component/block ref "components/this-does-not-exist"',
        },
      ],
    });
  });

  it("passes validation when every ref resolves", async () => {
    const recipe = makeRecipe([{ ref: "components/text" }]);
    const res = mockRes();

    await validateHandler({ body: { recipe } } as Request, res);

    expect(res.body).toMatchObject({ ok: true });
  });
});
