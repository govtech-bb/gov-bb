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

function makeRecipe(elements: { ref: string; overrides?: unknown }[]) {
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
    // A bare generic-text inherits the sentinel as its required message, which
    // the required-message layer now rejects (#2714) — so this fixture carries
    // the message a real recipe would.
    const recipe = makeRecipe([
      {
        ref: "components/generic-text",
        overrides: {
          fieldId: "employer-name",
          label: "Employer name",
          validations: {
            required: { value: true, error: "Employer name is required" },
          },
        },
      },
    ]);
    const res = mockRes();

    await validateHandler({ body: { recipe } } as Request, res);

    expect(res.body).toMatchObject({ ok: true });
  });
});

// #2714: the Deploy-gate half of #2227. `pnpm validate-recipes` guards recipes
// committed to the trunk; this guards what the builder deploys, and resolves
// the full catalog so a DB custom component's own defaults are checked too.
// Both read `requiredMessageDefect`, so the two gates cannot drift.
describe("POST /builder/registry/validate — required-message check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFullCatalogMock.mockResolvedValue(getCatalog());
  });

  it("rejects a required field left on the generic inherited message", async () => {
    const recipe = makeRecipe([
      {
        ref: "components/generic-text",
        overrides: { fieldId: "employer-name", label: "Employer name" },
      },
    ]);
    const res = mockRes();

    await validateHandler({ body: { recipe } } as Request, res);

    expect(res.body).toMatchObject({
      ok: false,
      issues: [{ path: "steps[step-1].elements[0]" }],
    });
    expect(
      (res.body as { issues: { message: string }[] }).issues[0].message,
    ).toMatch(/"employer-name" is required.*names no field/);
  });

  it("rejects an override that replaced a good base message with a bare rule", async () => {
    // The #2710 clobber: `required: { value: true }` over components/last-name
    // discards "Last name is required", since validations merge per rule key.
    const recipe = makeRecipe([
      {
        ref: "components/last-name",
        overrides: { validations: { required: { value: true } } },
      },
    ]);
    const res = mockRes();

    await validateHandler({ body: { recipe } } as Request, res);

    expect(res.body).toMatchObject({
      ok: false,
      issues: [{ path: "steps[step-1].elements[0]" }],
    });
    expect(
      (res.body as { issues: { message: string }[] }).issues[0].message,
    ).toMatch(/has no error message/);
  });

  it("accepts a required date field with no message", async () => {
    // validateDateField composes its own label-aware "Enter ${label}" — but
    // only when nothing is authored. Restating `required` replaces the base
    // rule wholesale (validations merge per rule key), which is what drops
    // generic-date's sentinel and leaves the derived message in play.
    const recipe = makeRecipe([
      {
        ref: "components/generic-date",
        overrides: {
          fieldId: "date-of-birth",
          label: "Date of birth",
          validations: { required: { value: true } },
        },
      },
    ]);
    const res = mockRes();

    await validateHandler({ body: { recipe } } as Request, res);

    expect(res.body).toMatchObject({ ok: true });
  });

  it("rejects a date field inheriting the sentinel from generic-date", async () => {
    // The exemption is for an *unauthored* date. `components/generic-date`
    // ships `error: "This field is required"`, so a recipe that overrides
    // only fieldId + label inherits it and the applicant reads it verbatim.
    const recipe = makeRecipe([
      {
        ref: "components/generic-date",
        overrides: { fieldId: "date-of-marriage", label: "Date of marriage" },
      },
    ]);
    const res = mockRes();

    await validateHandler({ body: { recipe } } as Request, res);

    expect(res.body).toMatchObject({
      ok: false,
      issues: [{ path: "steps[step-1].elements[0]" }],
    });
  });

  it("accepts an optional field with no message", async () => {
    const recipe = makeRecipe([
      {
        ref: "components/generic-text",
        overrides: {
          fieldId: "nickname",
          label: "Nickname",
          validations: { required: { value: false } },
        },
      },
    ]);
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
