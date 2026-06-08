import type { Request, Response } from "express";

// routes/forms.ts imports FormDefinitionEntity (used by the create handler).
// Stub it so loading the module doesn't drag in the full TypeORM entity graph.
jest.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
  FormConfigEntity: class FormConfigEntity {},
}));

jest.mock("../db.js", () => ({ getDataSource: jest.fn() }));

// Presence (read-only lock, #874) is exercised in presence.spec.ts; here it's
// out of scope, so treat every caller as the holder and let mockReq stamp a
// userLogin so the save handlers' presence gate is satisfied transparently.
jest.mock("./presence.js", () => ({
  holdsFreshClaim: jest.fn().mockResolvedValue(true),
}));

import { getDataSource } from "../db.js";
import { createFormHandler, updateFormHandler } from "./forms";

const getDataSourceMock = getDataSource as jest.Mock;

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
  // The create/update handlers now wrap their recipe write (and the optional
  // form_config upsert) in ds.transaction. Run the callback against a manager
  // that reuses the same repo + query mocks so existing save/UPDATE assertions
  // still hold; FormConfigEntity gets its own upsert stub.
  const configUpsert = jest.fn(async () => undefined);
  const manager = {
    getRepository: jest.fn((entity: any) =>
      entity?.name === "FormConfigEntity" ? { upsert: configUpsert } : repo,
    ),
    query,
  };
  const transaction = jest.fn(async (cb: (m: typeof manager) => unknown) =>
    cb(manager),
  );
  const ds = { getRepository: jest.fn(() => repo), query, transaction };
  return { ds, repo, save, query, configUpsert };
}

function recipe(over: Record<string, unknown> = {}) {
  return {
    formId: "marriage-license",
    version: "1.0.0",
    title: "Marriage License",
    ...over,
  };
}

// The write handlers now also consult the upstream published set (issue #556)
// via global.fetch. Default it to "no published forms" so the drafts-only cases
// behave exactly as before; individual tests override it.
const originalFetch = global.fetch;
const originalApiBaseUrl = process.env.API_BASE_URL;

beforeEach(() => {
  process.env.API_BASE_URL = "http://api.test";
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ data: [] }),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalApiBaseUrl === undefined) delete process.env.API_BASE_URL;
  else process.env.API_BASE_URL = originalApiBaseUrl;
  jest.useRealTimers();
});

// Make global.fetch resolve as the published-forms proxy would (apps/api wraps
// the list in `{ data: [...] }`).
function mockPublishedForms(
  forms: { formId: string; title: string; version?: string }[],
): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({
      data: forms.map((f) => ({ version: "1.0.0", ...f })),
    }),
  }) as unknown as typeof fetch;
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

  it("maps a unique-violation on the transactional save to the same 409 as the findOne duplicate path (true deploy race)", async () => {
    // The non-atomic findOne sees no duplicate (null), but a concurrent deploy
    // claims the same formId+version first, so the transactional save trips the
    // Postgres unique constraint (23505). TypeORM surfaces it as a
    // QueryFailedError carrying the driver code. Must surface as the SAME 409 the
    // findOne duplicate path returns — not a generic 500.
    const { ds, save } = fakeDataSource();
    const uniqueViolation = Object.assign(
      new Error("duplicate key value violates unique constraint"),
      { code: "23505", driverError: { code: "23505" } },
    );
    save.mockRejectedValueOnce(uniqueViolation);
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(mockReq({ recipe: recipe(), isNew: true }), res);

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toMatch(
      /v1\.0\.0 already exists/,
    );
  });

  it("does NOT map a non-unique-violation save error to 409 (stays 500)", async () => {
    // findOne sees no duplicate (null), but the transactional save fails for an
    // unrelated reason (a dropped connection — no Postgres 23505, no
    // driverError). Only 23505 maps to the deploy-race 409; anything else must
    // surface as a generic 500, not a misleading "version already exists".
    const { ds, save } = fakeDataSource();
    save.mockRejectedValueOnce(
      Object.assign(new Error("Connection terminated unexpectedly"), {
        code: "ECONNRESET",
      }),
    );
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(mockReq({ recipe: recipe(), isNew: true }), res);

    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).not.toMatch(/already exists/);
  });

  it("creates a unique form", async () => {
    const { ds, save } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createFormHandler(mockReq({ recipe: recipe(), isNew: true }), res);

    expect(res.statusCode).toBe(201);
    expect(save).toHaveBeenCalled();
  });

  it("rejects a create whose title collides with a published-only form (no draft row)", async () => {
    // No draft rows at all — the only collision is against the published set.
    const { ds } = fakeDataSource({ titleRows: [] });
    getDataSourceMock.mockResolvedValue(ds);
    mockPublishedForms([
      { formId: "birth-registration", title: "Birth Registration" },
    ]);

    const res = mockRes();
    await createFormHandler(
      mockReq({
        recipe: recipe({ formId: "new-form", title: "  birth registration " }),
        isNew: true,
      }),
      res,
    );

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toMatch(
      /already exists. Choose a different title/,
    );
  });

  it("rejects a create whose formId collides with a published-only form (isNew)", async () => {
    // formId not in drafts, but it belongs to a published form.
    const { ds } = fakeDataSource({ idExists: false });
    getDataSourceMock.mockResolvedValue(ds);
    mockPublishedForms([
      { formId: "marriage-license", title: "A Different Title" },
    ]);

    const res = mockRes();
    await createFormHandler(mockReq({ recipe: recipe(), isNew: true }), res);

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toMatch(
      /ID "marriage-license" already exists/,
    );
  });

  it("fails open (201) when the upstream published fetch rejects", async () => {
    const { ds, save } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    const res = mockRes();
    await createFormHandler(mockReq({ recipe: recipe(), isNew: true }), res);

    expect(res.statusCode).toBe(201);
    expect(save).toHaveBeenCalled();
  });

  it("fails open (201) when the upstream published fetch returns non-OK", async () => {
    const { ds, save } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue("Service Unavailable"),
    }) as unknown as typeof fetch;

    const res = mockRes();
    await createFormHandler(mockReq({ recipe: recipe(), isNew: true }), res);

    expect(res.statusCode).toBe(201);
    expect(save).toHaveBeenCalled();
  });

  it("fails open (201) when the upstream returns 200 with no data array", async () => {
    // Contract drift / degraded upstream: HTTP 200 but the body lacks the
    // `{ data: [...] }` envelope. Must fall back to drafts-only, not 500.
    const { ds, save } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({}),
    }) as unknown as typeof fetch;

    const res = mockRes();
    await createFormHandler(mockReq({ recipe: recipe(), isNew: true }), res);

    expect(res.statusCode).toBe(201);
    expect(save).toHaveBeenCalled();
  });

  it("fails open (201) when the upstream published fetch times out", async () => {
    jest.useFakeTimers();
    const { ds, save } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);
    // A hanging upstream: only ever settles when its abort signal fires.
    global.fetch = jest.fn(
      (_url: unknown, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    ) as unknown as typeof fetch;

    const res = mockRes();
    const pending = createFormHandler(
      mockReq({ recipe: recipe(), isNew: true }),
      res,
    );
    await jest.advanceTimersByTimeAsync(3000);
    await pending;

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

  it("rejects renaming into a published-only form's title (no draft row)", async () => {
    const { ds } = fakeDataSource({ putLatest, titleRows: [] });
    getDataSourceMock.mockResolvedValue(ds);
    mockPublishedForms([
      { formId: "birth-registration", title: "Birth Registration" },
    ]);

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

  it("allows keeping its own title when the form is also published (self-exclusion)", async () => {
    const { ds, query } = fakeDataSource({ putLatest, titleRows: [] });
    getDataSourceMock.mockResolvedValue(ds);
    // The form under edit is itself published — keeping its title must not
    // collide with its own published entry.
    mockPublishedForms([
      { formId: "marriage-license", title: "Marriage License" },
    ]);

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

  it("fails open (200) when the upstream published fetch rejects", async () => {
    const { ds, query } = fakeDataSource({ putLatest, titleRows: [] });
    getDataSourceMock.mockResolvedValue(ds);
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    const res = mockRes();
    await updateFormHandler(
      mockReq(
        { recipe: recipe({ formId: "marriage-license" }) },
        { formId: "marriage-license" },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE form_definitions/),
      expect.anything(),
    );
  });
});
