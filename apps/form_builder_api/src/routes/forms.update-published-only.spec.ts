import type { Mock } from "vitest";
import type { Request, Response } from "express";

// As in forms.uniqueness.spec.ts: stub the entities so loading routes/forms.ts
// doesn't drag in the full TypeORM entity graph.
vi.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
  FormConfigEntity: class FormConfigEntity {},
}));

vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));

// The read-only lock is exercised in presence.spec.ts; treat every caller here
// as the claim holder.
vi.mock("./presence.js", () => ({
  holdsFreshClaim: vi.fn().mockResolvedValue(true),
}));

import { getDataSource } from "../db.js";
import { updateFormHandler } from "./forms";

const getDataSourceMock = getDataSource as Mock;

function mockReq(body: unknown, params: Record<string, string> = {}): Request {
  const withLogin =
    body && typeof body === "object" && !Array.isArray(body)
      ? { userLogin: "tester", ...(body as Record<string, unknown>) }
      : body;
  return { body: withLogin, params } as unknown as Request;
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

/** `putRows` are the rows the PUT's `SELECT id ... WHERE form_id` lookup finds. */
function fakeDataSource({
  putRows = [] as { id: number }[],
  titleRows = [] as { form_id: string; title: string | null }[],
} = {}) {
  const repo = {
    findOne: vi.fn(async () => null),
    create: vi.fn((e: unknown) => e),
    save: vi.fn(async (e: unknown) => e),
    upsert: vi.fn(async () => undefined),
  };
  // Every SQL statement the handler runs, in order, with its bound params.
  const calls: { sql: string; params?: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (/DISTINCT ON \(form_id\)/i.test(sql)) return titleRows;
    if (/SELECT id FROM form_definitions WHERE form_id/i.test(sql))
      return putRows;
    return [];
  });
  const configUpsert = vi.fn(async () => undefined);
  const manager = {
    getRepository: vi.fn((entity: any) =>
      entity?.name === "FormConfigEntity" ? { upsert: configUpsert } : repo,
    ),
    query,
  };
  const transaction = vi.fn(async (cb: (m: typeof manager) => unknown) =>
    cb(manager),
  );
  const ds = { getRepository: vi.fn(() => repo), query, transaction };
  return { ds, repo, calls };
}

/** The statement matching `re`, if the handler ran one. */
function stmt(calls: { sql: string; params?: unknown[] }[], re: RegExp) {
  return calls.find((c) => re.test(c.sql));
}

function recipe(over: Record<string, unknown> = {}) {
  return {
    formId: "sports-training-programme-form-schema",
    title: "Register for Community Sports Training Programme",
    steps: [],
    ...over,
  };
}

const originalFetch = global.fetch;
const originalApiBaseUrl = process.env.API_BASE_URL;

beforeEach(() => {
  process.env.API_BASE_URL = "http://api.test";
  // Default: nothing published upstream.
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

/** Make the published-forms proxy respond as apps/api does (`{ data: [...] }`). */
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

// A published-only form (#1196): its recipe lives solely as the committed
// canonical flat file, so the builder's GET path serves it via the published
// fallback and the form opens and edits normally — but there is no
// form_definitions scratch row for the PUT to update.
describe("updateFormHandler — published-only form (no draft row)", () => {
  it("seeds a draft row and saves when the formId is published upstream", async () => {
    const { ds, calls } = fakeDataSource({ putRows: [] });
    getDataSourceMock.mockResolvedValue(ds);
    mockPublishedForms([
      {
        formId: "sports-training-programme-form-schema",
        title: "Register for Community Sports Training Programme",
      },
    ]);

    const res = mockRes();
    await updateFormHandler(
      mockReq(
        { recipe: recipe() },
        {
          formId: "sports-training-programme-form-schema",
        },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    // Seeded as a versionless, unpublished scratch row — not an UPDATE of a row
    // that doesn't exist.
    const seed = stmt(calls, /INSERT INTO form_definitions/i);
    expect(seed).toBeDefined();
    expect(seed!.params).toEqual([
      "sports-training-programme-form-schema",
      expect.objectContaining({
        formId: "sports-training-programme-form-schema",
      }),
    ]);
    // Conflict target is UNIQUE(form_id), so two concurrent saves of the same
    // published-only form resolve to last-write-wins rather than the loser
    // raising an unhandled unique violation.
    expect(seed!.sql).toMatch(/ON CONFLICT \(form_id\) DO UPDATE SET schema/i);
    expect(stmt(calls, /UPDATE form_definitions SET/i)).toBeUndefined();
  });

  it("still 404s when the formId has neither a draft row nor a published recipe", async () => {
    const { ds, calls } = fakeDataSource({ putRows: [] });
    getDataSourceMock.mockResolvedValue(ds);
    // Default fetch mock: nothing published.

    const res = mockRes();
    await expect(
      updateFormHandler(
        mockReq(
          { recipe: recipe() },
          {
            formId: "sports-training-programme-form-schema",
          },
        ),
        res,
      ),
    ).rejects.toMatchObject({
      status: 404,
      message:
        "No recipe found for formId: sports-training-programme-form-schema",
    });
    // Nothing was written — a stale tab can't resurrect a deleted form.
    expect(stmt(calls, /INSERT INTO form_definitions/i)).toBeUndefined();
  });

  it("updates in place (no seed) when a draft row does exist", async () => {
    const { ds, calls } = fakeDataSource({ putRows: [{ id: 7 }] });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await updateFormHandler(
      mockReq(
        { recipe: recipe() },
        {
          formId: "sports-training-programme-form-schema",
        },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    const update = stmt(calls, /UPDATE form_definitions SET/i);
    expect(update).toBeDefined();
    expect(update!.params?.[1]).toBe(7);
    expect(stmt(calls, /INSERT INTO form_definitions/i)).toBeUndefined();
  });
});
