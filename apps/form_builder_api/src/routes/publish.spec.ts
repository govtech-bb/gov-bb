import type { Request, Response } from "express";
import { getCatalog } from "@govtech-bb/form-builder";

// The publish backstop resolves the same catalog the /validate endpoint does
// (id-collision + unknown-ref checks are catalog-dependent, ADR 0010). Mock the
// accessor so the spec drives a known builtin catalog without a DB.
jest.mock("../catalog.js", () => ({ getFullCatalog: jest.fn() }));

// The read-only lock (#874) gates publish behind a fresh editing claim, after
// validation. Treat the caller as the holder so these backstop tests reach the
// GitHub flow; presence enforcement has its own spec (publish.presence.spec.ts).
jest.mock("../db.js", () => ({ getDataSource: jest.fn(async () => ({})) }));
jest.mock("./presence.js", () => ({
  holdsFreshClaim: jest.fn().mockResolvedValue(true),
}));

import { getFullCatalog } from "../catalog.js";
import { publishHandler } from "./publish";

const getFullCatalogMock = getFullCatalog as jest.Mock;

function mockReq(body: unknown): Request {
  return { body } as unknown as Request;
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

// A schema-valid, catalog-resolvable recipe — every ref exists in the builtin
// catalog and all ids are kebab-case, so it clears the backstop and proceeds to
// the GitHub flow.
function validRecipe() {
  return {
    formId: "form-001",
    title: "Test Form",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    steps: [
      {
        stepId: "step-1",
        title: "Step 1",
        elements: [{ ref: "components/generic-text" }],
      },
    ],
  };
}

describe("POST /builder/publish — validation backstop", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getFullCatalogMock.mockResolvedValue(getCatalog());
  });

  afterEach(() => {
    delete (global as { fetch?: unknown }).fetch;
  });

  it("returns 400 with issues and makes no GitHub call for a contract-invalid recipe", async () => {
    const fetchMock = jest.fn();
    (global as { fetch?: unknown }).fetch = fetchMock;

    // snake_case stepId — a contract violation the schema rejects.
    const recipe = {
      ...validRecipe(),
      steps: [{ stepId: "applicant_details", title: "Step 1", elements: [] }],
    };
    const res = mockRes();

    await publishHandler(mockReq({ recipe, githubToken: "ghtok" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
    expect((res.body as { issues: unknown[] }).issues.length).toBeGreaterThan(
      0,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 with issues for an unknown component ref, no GitHub call", async () => {
    const fetchMock = jest.fn();
    (global as { fetch?: unknown }).fetch = fetchMock;

    const recipe = {
      ...validRecipe(),
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [{ ref: "components/this-does-not-exist" }],
        },
      ],
    };
    const res = mockRes();

    await publishHandler(mockReq({ recipe, githubToken: "ghtok" }), res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { issues: unknown[] }).issues.length).toBeGreaterThan(
      0,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proceeds to the GitHub publish flow for a valid recipe", async () => {
    const fetchMock = jest.fn((url: string) => {
      if (url.includes("/git/ref/heads/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ object: { sha: "base-sha" } }),
        });
      }
      if (url.endsWith("/pulls")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ number: 42, html_url: "https://pr/42" }),
        });
      }
      // /git/refs create + /contents PUT
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    (global as { fetch?: unknown }).fetch = fetchMock;

    const res = mockRes();

    await publishHandler(
      mockReq({
        recipe: validRecipe(),
        githubToken: "ghtok",
        userLogin: "tester",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ prUrl: "https://pr/42", prNumber: 42 });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("still rejects a missing recipe/token before validating", async () => {
    const fetchMock = jest.fn();
    (global as { fetch?: unknown }).fetch = fetchMock;
    const res = mockRes();

    await publishHandler(mockReq({ githubToken: "ghtok" }), res);

    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
