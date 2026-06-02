import type { Request, Response } from "express";

// routes/forms.ts imports FormDefinitionEntity (used by the create handler).
// Stub it so loading the module doesn't drag in the full TypeORM entity graph.
jest.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
}));

jest.mock("../db.js", () => ({ getDataSource: jest.fn() }));

import { getDataSource } from "../db.js";
import { createFormHandler, updateFormHandler } from "./forms";

const getDataSourceMock = getDataSource as jest.Mock;

function mockReq(body: unknown, params: Record<string, string> = {}): Request {
  return { body, params } as unknown as Request;
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

interface FakeRows {
  /** Rows returned by the latest-version-per-formId title query (DISTINCT ON). */
  titleRows?: { form_id: string; title: string | null }[];
  /** Rows returned by the `SELECT 1 ... WHERE form_id` existence probe. */
  idExists?: boolean;
  /** Rows returned by the PUT "latest version" lookup. */
  putLatest?: { id: number; version: string; published_at: string | null }[];
  /** Result of repo.findOne (the exact formId+version row), if any. */
  existingVersion?: unknown;
}

function fakeDataSource(rows: FakeRows = {}) {
  const {
    titleRows = [],
    idExists = false,
    putLatest = [],
    existingVersion = null,
  } = rows;
  const save = jest.fn(async (e: unknown) => e);
  const repo = {
    findOne: jest.fn(async () => existingVersion),
    create: jest.fn((e: unknown) => e),
    save,
  };
  const query = jest.fn(async (sql: string) => {
    if (/DISTINCT ON \(form_id\)/i.test(sql)) return titleRows;
    if (/SELECT 1 FROM form_definitions WHERE form_id/i.test(sql))
      return idExists ? [{ "?column?": 1 }] : [];
    if (/SELECT id, version, published_at/i.test(sql)) return putLatest;
    if (/UPDATE form_definitions/i.test(sql)) return [];
    return [];
  });
  const ds = { getRepository: jest.fn(() => repo), query };
  return { ds, repo, save, query };
}

function recipe(over: Record<string, unknown> = {}) {
  return {
    formId: "marriage-license",
    version: "1.0.0",
    title: "Marriage License",
    ...over,
  };
}

describe("createFormHandler — uniqueness", () => {
  it("rejects a create whose formId already exists (isNew)", async () => {
    const { ds } = fakeDataSource({ idExists: true });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(mockReq({ recipe: recipe(), isNew: true }), res);

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toMatch(
      /ID "marriage-license" already exists/,
    );
  });

  it("allows a new version of an existing form (isNew false — id check skipped)", async () => {
    // formId exists, but this is a version bump, not a create.
    const { ds, save } = fakeDataSource({ idExists: true });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(
      mockReq({ recipe: recipe({ version: "1.1.0" }), isNew: false }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(save).toHaveBeenCalled();
  });

  it("rejects a create whose title collides case/whitespace-insensitively", async () => {
    const { ds } = fakeDataSource({
      titleRows: [
        { form_id: "birth-registration", title: "Birth Registration" },
      ],
    });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(
      mockReq({
        recipe: recipe({ title: "  birth registration " }),
        isNew: true,
      }),
      res,
    );

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toMatch(
      /already exists. Choose a different title/,
    );
  });

  it("keeps the existing exact formId+version 409", async () => {
    const { ds } = fakeDataSource({ existingVersion: { id: 1 } });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(mockReq({ recipe: recipe(), isNew: true }), res);

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toMatch(
      /v1\.0\.0 already exists/,
    );
  });

  it("creates a unique form", async () => {
    const { ds, save } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(mockReq({ recipe: recipe(), isNew: true }), res);

    expect(res.statusCode).toBe(201);
    expect(save).toHaveBeenCalled();
  });
});

describe("updateFormHandler — title uniqueness on rename", () => {
  const putLatest = [{ id: 7, version: "1.0.0", published_at: null }];

  it("rejects renaming into another form's title", async () => {
    const { ds } = fakeDataSource({
      putLatest,
      titleRows: [
        { form_id: "birth-registration", title: "Birth Registration" },
      ],
    });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await updateFormHandler(
      mockReq(
        {
          recipe: recipe({
            formId: "marriage-license",
            title: "Birth Registration",
          }),
        },
        { formId: "marriage-license" },
      ),
      res,
    );

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toMatch(
      /Choose a different title/,
    );
  });

  it("allows a form keeping its own title (rename-to-self)", async () => {
    const { ds, query } = fakeDataSource({
      putLatest,
      titleRows: [{ form_id: "marriage-license", title: "Marriage License" }],
    });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await updateFormHandler(
      mockReq(
        {
          recipe: recipe({
            formId: "marriage-license",
            title: "Marriage License",
          }),
        },
        { formId: "marriage-license" },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE form_definitions/),
      expect.anything(),
    );
  });
});
