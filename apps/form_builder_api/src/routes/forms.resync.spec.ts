import type { Mock } from "vitest";
import type { Request, Response } from "express";

// As in forms.update-published-only.spec.ts: stub the entities so loading
// routes/forms.ts doesn't drag in the full TypeORM entity graph.
vi.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
  FormConfigEntity: class FormConfigEntity {},
}));

vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));

// A re-sync is not an author edit, so it must not consult the editing claim.
// Keep the mock strict (never resolves) to prove the handler doesn't call it.
vi.mock("./presence.js", () => ({
  holdsFreshClaim: vi.fn(() => {
    throw new Error("resync must not check presence");
  }),
}));

import { getDataSource } from "../db.js";
import { resyncFormHandler } from "./forms";

const getDataSourceMock = getDataSource as Mock;

function mockReq(body: unknown, params: Record<string, string>): Request {
  return { body, params } as unknown as Request;
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

/** `affected` is how many rows the compare-and-swap UPDATE matched. TypeORM's
 *  Postgres query() answers an UPDATE with `[rows, rowCount]`, so that is the
 *  shape the fake returns — the real DB spec caught a handler that read the
 *  array's length instead. */
function fakeDataSource(affected = 0) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return /UPDATE form_definitions/i.test(sql) ? [[], affected] : [];
  });
  return { ds: { query }, calls };
}

const FORM_ID = "apply-for-conductor-licence";
const COMMITTED_AT = "2026-09-15T10:00:00Z";

function recipe(over: Record<string, unknown> = {}) {
  return {
    formId: FORM_ID,
    title: "Apply for Conductor Licence",
    steps: [],
    ...over,
  };
}

// The SQL semantics — pre-ship row untouched, newer draft untouched, stale
// row replaced — live in the UPDATE's WHERE and are exercised against a real
// Postgres in forms.resync.db.spec.ts. This spec pins the statement and the
// handler's contract around it.
describe("resyncFormHandler — POST /builder/forms/:formId/resync (#2489)", () => {
  it("replaces the row with the committed recipe in one compare-and-swap and reports resynced: true", async () => {
    const { ds, calls } = fakeDataSource(1);
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await resyncFormHandler(
      mockReq(
        { recipe: recipe(), committedAt: COMMITTED_AT },
        { formId: FORM_ID },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ resynced: true });
    expect(calls).toHaveLength(1);
    const { sql, params } = calls[0];
    expect(sql).toMatch(/UPDATE form_definitions/i);
    // The committed recipe becomes the row, and the row reads as saved now —
    // newer than the commit it was synced to, so the next open is a no-op
    // until the recipe changes again.
    expect(sql).toMatch(/SET schema = \$1, updated_at = NOW\(\)/i);
    // Only a row saved since updated_at began recording saves …
    expect(sql).toMatch(/updated_at > created_at/i);
    // … and saved before the commit landed. timestamptz, so the comparison
    // goes through the session time zone the same way NOW() was stored.
    expect(sql).toMatch(/updated_at < \$3::timestamptz/i);
    expect(params).toEqual([
      expect.objectContaining({ formId: FORM_ID }),
      FORM_ID,
      COMMITTED_AT,
    ]);
  });

  it("reports resynced: false when the row was not replaced (newer, pre-ship, or absent)", async () => {
    const { ds } = fakeDataSource(0);
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await resyncFormHandler(
      mockReq(
        { recipe: recipe(), committedAt: COMMITTED_AT },
        { formId: FORM_ID },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ resynced: false });
  });

  it("does not require or consult the editing claim (not an author edit)", async () => {
    const { ds } = fakeDataSource(1);
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    // No userLogin in the body; the presence mock throws if it is ever called.
    await resyncFormHandler(
      mockReq(
        { recipe: recipe(), committedAt: COMMITTED_AT },
        { formId: FORM_ID },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
  });

  it("400s on a committedAt that is not an ISO datetime, writing nothing", async () => {
    const { ds, calls } = fakeDataSource(1);
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await resyncFormHandler(
      mockReq(
        { recipe: recipe(), committedAt: "yesterday" },
        { formId: FORM_ID },
      ),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("400s on a structurally invalid recipe, writing nothing (#1499)", async () => {
    const { ds, calls } = fakeDataSource(1);
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await resyncFormHandler(
      mockReq(
        { recipe: { title: "no formId or steps" }, committedAt: COMMITTED_AT },
        { formId: FORM_ID },
      ),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("400s on an unsafe processor config, writing nothing (#281)", async () => {
    const { ds, calls } = fakeDataSource(1);
    getDataSourceMock.mockResolvedValue(ds);
    const res = mockRes();

    await resyncFormHandler(
      mockReq(
        {
          recipe: recipe({
            processors: [
              { type: "webhook", config: { url: "http://169.254.169.254/" } },
            ],
          }),
          committedAt: COMMITTED_AT,
        },
        { formId: FORM_ID },
      ),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/processor/i);
    expect(calls).toHaveLength(0);
  });
});
