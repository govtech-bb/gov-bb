import type { Mock } from "vitest";
import type { Request, Response } from "express";
import { getCatalog } from "@govtech-bb/form-builder";
import { KEBAB_ID_ERROR } from "@govtech-bb/form-types";

vi.mock("../catalog.js", () => ({ getFullCatalog: vi.fn() }));

import { getFullCatalog } from "../catalog.js";
import { validateHandler } from "./registry";

const getFullCatalogMock = getFullCatalog as Mock;

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
    vi.clearAllMocks();
    getFullCatalogMock.mockResolvedValue(getCatalog());
  });

  it("returns ok:false with an issue for an unknown ref", async () => {
    const recipe = makeRecipe([
      { ref: "components/generic-text" },
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
    const recipe = makeRecipe([{ ref: "components/generic-text" }]);
    const res = mockRes();

    await validateHandler({ body: { recipe } } as Request, res);

    expect(res.body).toMatchObject({ ok: true });
  });
});

// The kebab-case id rule lives in the shared schema (kebabIdSchema, issues
// #741/#745) and reaches this endpoint for free because validateHandler
// funnels the recipe through validateFormContract before any catalog work.
// These specs pin that the endpoint actually rejects snake_case ids and
// surfaces KEBAB_ID_ERROR at a useful, dotted path — a contract-level guard
// that the funnel can't be silently removed.
describe("POST /builder/registry/validate — kebab-case id enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFullCatalogMock.mockResolvedValue(getCatalog());
  });

  it("rejects a snake_case overrides.fieldId inside a step element", async () => {
    const recipe = {
      formId: "form-001",
      title: "Test Form",
      version: "1.0.0",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [
            {
              ref: "components/generic-text",
              overrides: { fieldId: "applicant_first_name" },
            },
          ],
        },
      ],
    };
    const res = mockRes();

    await validateHandler({ body: { recipe } } as Request, res);

    expect(res.body).toEqual({
      ok: false,
      issues: [
        {
          path: "steps.0.elements.0.overrides.fieldId",
          message: KEBAB_ID_ERROR,
        },
      ],
    });
  });

  it("rejects a snake_case stepId", async () => {
    const recipe = {
      formId: "form-001",
      title: "Test Form",
      version: "1.0.0",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      steps: [{ stepId: "applicant_details", title: "Step 1", elements: [] }],
    };
    const res = mockRes();

    await validateHandler({ body: { recipe } } as Request, res);

    expect(res.body).toEqual({
      ok: false,
      issues: [
        {
          path: "steps.0.stepId",
          message: KEBAB_ID_ERROR,
        },
      ],
    });
  });
});
