import type { Mock } from "vitest";
import type { Request, Response } from "express";

// routes/forms.ts imports FormDefinitionEntity (used by the create + rekey
// insert path). Stub it so loading the module doesn't drag in the full TypeORM
// entity graph.
vi.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
}));

// The DataSource is the unit under control: mock the accessor so each test
// drives a fake transactional manager.
vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));

// Presence (read-only lock, #874) is exercised in presence.spec.ts; here it's
// out of scope, so treat every caller as the holder and let mockReq stamp a
// userLogin so the rekey presence gate is satisfied transparently.
vi.mock("./presence.js", () => ({
  holdsFreshClaim: vi.fn().mockResolvedValue(true),
}));

import { getDataSource } from "../db.js";
import { rekeyFormHandler } from "./forms";

const getDataSourceMock = getDataSource as Mock;

function mockReq(params: Record<string, string>, body?: unknown): Request {
  const withLogin =
    body && typeof body === "object" && !Array.isArray(body)
      ? { userLogin: "tester", ...(body as Record<string, unknown>) }
      : body;
  return { params, body: withLogin } as unknown as Request;
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

interface OldRow {
  id: string;
  version: string;
  published_at: string | null;
  schema?: unknown;
}

interface FakeRows {
  /** Rows for the old-ID load (`WHERE form_id = $1`). [] => 404. */
  oldRows?: OldRow[];
  /** Whether the new ID already belongs to another DB form (the `SELECT 1`). */
  newIdExists?: boolean;
  /** Rows for the latest-version-per-formId title query (DISTINCT ON). */
  titleRows?: { form_id: string; title: string | null }[];
  /** Rows for the post-move `(newId, version)` existence probe. */
  existingNewVersion?: { id: string }[];
}

/**
 * Build a fake DataSource whose `transaction` runs the callback against a fake
 * EntityManager. `manager.query` answers by matching the SQL so a test can
 * stage which rows each step sees; `manager.getRepository` drives the INSERT
 * path (re-key combined with a version bump).
 */
function fakeDataSource(rows: FakeRows = {}) {
  const {
    oldRows = [],
    newIdExists = false,
    titleRows = [],
    existingNewVersion = [],
  } = rows;
  const save = vi.fn(async (e: unknown) => e);
  const create = vi.fn((e: unknown) => e);
  const repo = { create, save };
  const query = vi.fn(async (sql: string) => {
    if (/DISTINCT ON \(form_id\)/i.test(sql)) return titleRows;
    if (/published_at, schema FROM form_definitions/i.test(sql)) return oldRows;
    if (/SELECT 1 FROM form_definitions/i.test(sql))
      return newIdExists ? [{ "?column?": 1 }] : [];
    if (
      /SELECT id FROM form_definitions WHERE form_id = \$1 AND version/i.test(
        sql,
      )
    )
      return existingNewVersion;
    if (/UPDATE form_definitions/i.test(sql)) return [];
    return [];
  });
  const manager = { query, getRepository: vi.fn(() => repo) };
  const ds = {
    query,
    getRepository: vi.fn(() => repo),
    transaction: vi.fn(async (cb: (m: typeof manager) => Promise<unknown>) =>
      cb(manager),
    ),
  };
  return { ds, manager, repo, save, create, query };
}

function recipe(over: Record<string, unknown> = {}) {
  return {
    formId: "birth-registration",
    version: "1.0.0",
    title: "Birth Registration",
    ...over,
  };
}

function sqlsOf(query: Mock): string[] {
  return query.mock.calls.map((call) => call[0] as string);
}

// The handler consults the upstream published set (issue #556) via global.fetch.
// Default it to "no published forms" so the drafts-only cases behave plainly;
// individual tests override it.
const originalFetch = global.fetch;
const originalApiBaseUrl = process.env.API_BASE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.API_BASE_URL = "http://api.test";
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ data: [] }),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalApiBaseUrl === undefined) delete process.env.API_BASE_URL;
  else process.env.API_BASE_URL = originalApiBaseUrl;
});

function mockPublishedForms(
  forms: { formId: string; title: string; version?: string }[],
): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      data: forms.map((f) => ({ version: "1.0.0", ...f })),
    }),
  }) as unknown as typeof fetch;
}

describe("rekeyFormHandler — POST /builder/forms/:formId/rekey", () => {
  it("moves a draft form to the new ID and overwrites the saved version's schema", async () => {
    const { ds, query, save } = fakeDataSource({
      oldRows: [{ id: "row1", version: "1.0.0", published_at: null }],
      // The form's own prior record still carries the same title under the old
      // ID — it must be excluded so it doesn't self-collide.
      titleRows: [{ form_id: "birth-reg-old", title: "Birth Registration" }],
      existingNewVersion: [{ id: "row1" }],
    });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await rekeyFormHandler(
      mockReq({ formId: "birth-reg-old" }, { recipe: recipe() }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const sqls = sqlsOf(query);
    expect(
      sqls.some((s) => /UPDATE form_definitions SET form_id/i.test(s)),
    ).toBe(true);
    expect(
      sqls.some((s) => /UPDATE form_definitions SET schema/i.test(s)),
    ).toBe(true);
    // Same-version re-key updates the moved row in place — no fresh INSERT.
    expect(save).not.toHaveBeenCalled();
  });

  it("moves the form_config MDA-contact link to the new ID (#732)", async () => {
    const { ds, query } = fakeDataSource({
      oldRows: [{ id: "row1", version: "1.0.0", published_at: null }],
      existingNewVersion: [{ id: "row1" }],
    });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await rekeyFormHandler(
      mockReq({ formId: "birth-reg-old" }, { recipe: recipe() }),
      res,
    );

    expect(res.statusCode).toBe(200);
    // The config row (keyed by form_id) must follow the re-key, else the new ID
    // loses its config.mdaEmail recipient. Asserts params, not just presence.
    const configMove = query.mock.calls.find((c) =>
      /UPDATE form_config SET form_id/i.test(c[0] as string),
    );
    expect(configMove).toBeDefined();
    expect(configMove?.[1]).toEqual(["birth-registration", "birth-reg-old"]);
  });

  it("carries the form_config blob (incl. processors) to the new ID via the row move (#716)", async () => {
    // The whole form_config row — mda_contact_id AND the `config` JSONB blob
    // that now holds payment processors — moves with a single
    // `UPDATE form_config SET form_id`. There's no per-key copy, so the blob
    // survives a re-key untouched; assert the row-move fires keyed by form_id.
    const { ds, query } = fakeDataSource({
      oldRows: [{ id: "row1", version: "1.0.0", published_at: null }],
      existingNewVersion: [{ id: "row1" }],
    });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await rekeyFormHandler(
      mockReq({ formId: "birth-reg-old" }, { recipe: recipe() }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const configMove = query.mock.calls.find((c) =>
      /UPDATE form_config SET form_id/i.test(c[0] as string),
    );
    // The move is whole-row (only `SET form_id = ...`), so the processors blob
    // is carried implicitly — the SQL never enumerates the `config` JSONB
    // column, which would risk overwriting it.
    expect(configMove).toBeDefined();
    expect(configMove?.[0] as string).not.toMatch(/SET\s+config/i);
    expect(configMove?.[1]).toEqual(["birth-registration", "birth-reg-old"]);
  });

  it("allows a re-key whose title matches only the form's own prior record", async () => {
    const { ds } = fakeDataSource({
      oldRows: [{ id: "row1", version: "1.0.0", published_at: null }],
      titleRows: [{ form_id: "birth-reg-old", title: "Birth Registration" }],
      existingNewVersion: [{ id: "row1" }],
    });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await rekeyFormHandler(
      mockReq({ formId: "birth-reg-old" }, { recipe: recipe() }),
      res,
    );

    expect(res.statusCode).toBe(200);
  });

  it("returns 404 when no form exists under the old ID", async () => {
    const { ds, query } = fakeDataSource({ oldRows: [] });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await rekeyFormHandler(
      mockReq({ formId: "ghost" }, { recipe: recipe() }),
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(
      sqlsOf(query).some((s) => /UPDATE form_definitions SET form_id/i.test(s)),
    ).toBe(false);
  });

  it("blocks re-key when a DB row for the old ID is published", async () => {
    const { ds, query } = fakeDataSource({
      oldRows: [{ id: "row1", version: "1.0.0", published_at: "2026-01-01" }],
    });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await rekeyFormHandler(
      mockReq({ formId: "birth-reg-old" }, { recipe: recipe() }),
      res,
    );

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toMatch(/published form/i);
    expect(
      sqlsOf(query).some((s) => /UPDATE form_definitions SET form_id/i.test(s)),
    ).toBe(false);
  });

  it("blocks re-key when the old ID appears in the upstream published set", async () => {
    mockPublishedForms([
      { formId: "birth-reg-old", title: "Birth Registration" },
    ]);
    const { ds, query } = fakeDataSource({
      oldRows: [{ id: "row1", version: "1.0.0", published_at: null }],
    });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await rekeyFormHandler(
      mockReq({ formId: "birth-reg-old" }, { recipe: recipe() }),
      res,
    );

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toMatch(/published form/i);
    expect(
      sqlsOf(query).some((s) => /UPDATE form_definitions SET form_id/i.test(s)),
    ).toBe(false);
  });

  it("rejects a re-key to an ID already owned by another form", async () => {
    const { ds, query } = fakeDataSource({
      oldRows: [{ id: "row1", version: "1.0.0", published_at: null }],
      newIdExists: true,
    });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await rekeyFormHandler(
      mockReq({ formId: "birth-reg-old" }, { recipe: recipe() }),
      res,
    );

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toMatch(
      /ID "birth-registration" already exists/,
    );
    expect(
      sqlsOf(query).some((s) => /UPDATE form_definitions SET form_id/i.test(s)),
    ).toBe(false);
  });

  it("rejects a re-key to a title owned by a different form", async () => {
    const { ds, query } = fakeDataSource({
      oldRows: [{ id: "row1", version: "1.0.0", published_at: null }],
      // A different form already holds this title.
      titleRows: [{ form_id: "some-other-form", title: "Birth Registration" }],
    });
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await rekeyFormHandler(
      mockReq({ formId: "birth-reg-old" }, { recipe: recipe() }),
      res,
    );

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toMatch(
      /titled "Birth Registration" already exists/,
    );
    expect(
      sqlsOf(query).some((s) => /UPDATE form_definitions SET form_id/i.test(s)),
    ).toBe(false);
  });

  it("returns 400 when the recipe is missing formId or version", async () => {
    const { ds } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await rekeyFormHandler(
      mockReq({ formId: "birth-reg-old" }, { recipe: { title: "x" } }),
      res,
    );

    expect(res.statusCode).toBe(400);
  });
});
