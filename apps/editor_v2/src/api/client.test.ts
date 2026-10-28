import { createServer, type IncomingHttpHeaders } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Category, CategoryFields } from "./categories";
import {
  ApiFailure,
  CategoryConflict,
  CategoryInUse,
  CategoryAnswerMalformed,
  CategoryOutcomeUnknown,
  createEditorApi,
  type SavePageInput,
} from "./client";
import { QueryClient } from "@tanstack/react-query";
import {
  PageEditLockToken,
  pageContentVersionSchema,
  pageEditLockGenerationSchema,
  pageEditActivitySequenceSchema,
} from "./page-schemas";
import { pageQuery } from "./queries";

let origin: string;

let status = 200;

let response = "";

const requests: { url: string; method: string; headers: IncomingHttpHeaders; body: string }[] = [];

const server = createServer(async (request, reply) => {
  let body = "";

  for await (const chunk of request) body += chunk;
  requests.push({
    url: request.url ?? "",
    method: request.method ?? "",
    headers: request.headers,
    body,
  });
  reply.writeHead(status, { "content-type": "application/json" });
  reply.end(response);
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Parse the Node server address union at its I/O boundary.
  if (!address || typeof address === "string") throw new Error("Test server has no TCP address");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

beforeEach(() => {
  requests.length = 0;
  status = 200;
  response = JSON.stringify(page);
});

const id = "11111111-1111-4111-8111-111111111111";

const credential = "22222222-2222-4222-8222-222222222222";

const token = PageEditLockToken.parse(credential);

if (!token) throw new Error("Invalid test credential");

const fields: SavePageInput = {
  version: pageContentVersionSchema.parse(1),
  url: "/money-financial-support/calculate-severance-pay",
  category_id: null,
  title: "Calculate severance pay",
  description: null,
  visibility: "draft",
  form_id: null,
  body_markdown: "Hello",
  frontmatter: {},
};

const page = {
  ...fields,
  id,
  parent_id: null,
  slug: "calculate-severance-pay",
  published_at: null,
  created_at: "2026-10-07T12:00:00.000Z",
  updated_at: "2026-10-07T12:00:00.000Z",
  version: 2,
};

const lock = {
  state: "held",
  lockGeneration: 1,
  serverTime: "2026-10-07T12:00:00.000Z",
  holderName: "Editor",
  ownedByCaller: true,
  lockExpiresAt: "2026-10-07T12:02:00.000Z",
  lastActivityAt: "2026-10-07T12:00:00.000Z",
  idlePromptAt: "2026-10-07T12:10:00.000Z",
  idleExpiresAt: "2026-10-07T12:12:00.000Z",
  activitySequence: 0,
};

const health: Category = {
  id: "6f1c1a52-2d0a-4f6e-9a57-8e0c2d1b3a01",
  parent_id: null,
  title: "Health",
  slug: "health",
  description: null,
  url: "/health",
  position: 0,
  services: 2,
  reserved_route: false,
  updated_at: "2026-10-26T12:00:00.123Z",
};

const clinics: Category = {
  ...health,
  id: "6f1c1a52-2d0a-4f6e-9a57-8e0c2d1b3a02",
  parent_id: health.id,
  title: "Clinics",
  slug: "clinics",
  description: "Where to go",
  url: "/health/clinics",
  services: 0,
  reserved_route: true,
};

const categoryFields: CategoryFields = {
  title: "Clinics",
  slug: "clinics",
  parent_id: health.id,
  description: null,
};

describe("page API contracts", () => {
  it("sends the reviewed numeric version in JSON and ownership in its own header", async () => {
    const result = await createEditorApi(origin).savePage(id, fields, token);
    expect(result).toMatchObject({ ok: true, value: { id, version: 2 } });
    expect(requests.at(-1)).toMatchObject({
      url: `/pages/${id}`,
      method: "PUT",
      headers: { "content-type": "application/json", "x-page-edit-lock-token": credential },
    });
    expect(requests.at(-1)?.headers["if-match"]).toBeUndefined();
    expect(requests.at(-1)?.headers["if-updated-at"]).toBeUndefined();
    expect(JSON.parse(requests.at(-1)?.body ?? "null")).toEqual(fields);
  });

  it("deletes the confirmed query version without a body or a credential in the URL", async () => {
    status = 204;
    response = "";
    expect(await createEditorApi(origin).deletePage(id, fields.version, token)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(requests.at(-1)).toMatchObject({
      url: `/pages/${id}?version=1`,
      method: "DELETE",
      body: "",
    });
    expect(requests.at(-1)?.headers["content-type"]).toBeUndefined();
    expect(requests.at(-1)?.url).not.toContain(credential);
  });

  it("reads the shared category list from /editor/categories", async () => {
    status = 200;
    response = JSON.stringify({ categories: [health, clinics] });

    expect(await createEditorApi(origin).categories()).toEqual({
      ok: true,
      value: [health, clinics],
    });
    expect(requests.at(-1)).toMatchObject({ url: "/editor/categories", method: "GET" });
  });

  it.each([
    ["no list", { items: [] }],
    ["a missing reserved_route", { categories: [{ ...health, reserved_route: undefined }] }],
    [
      "a stamp without milliseconds",
      { categories: [{ ...health, updated_at: "2026-10-26T12:00:00Z" }] },
    ],
    ["a count that isn't a whole number", { categories: [{ ...health, services: 1.5 }] }],
    ["an id that isn't a UUID", { categories: [{ ...health, id: "health" }] }],
    ["a number for a title", { categories: [{ ...health, title: 7 }] }],
    [
      "an empty description left undefined",
      { categories: [{ ...health, description: undefined }] },
    ],
  ])("returns a malformed category list with %s as a failure", async (_case, body) => {
    status = 200;
    response = JSON.stringify(body);
    const listed = await createEditorApi(origin).categories();

    expect(listed.ok).toBe(false);
    expect(listed.ok || listed.error).toBeInstanceOf(CategoryAnswerMalformed);
  });

  it("returns a category read's refusal or lost answer as a failure", async () => {
    status = 401;
    response = JSON.stringify({ error: "unauthorized", message: "Sign in." });
    expect(await createEditorApi(origin).categories()).toMatchObject({
      ok: false,
      error: { _tag: "CategoryAccessDenied", status: 401 },
    });

    status = 503;
    response = "";
    expect(await createEditorApi(origin).categories()).toMatchObject({
      ok: false,
      error: { _tag: "CategoryRefused", status: 503 },
    });

    // A read that got no answer changed nothing: it is only unreachable
    expect(await createEditorApi("http://127.0.0.1:1").categories()).toMatchObject({
      ok: false,
      error: { _tag: "CategoryUnreachable", status: 0 },
    });
  });

  it("creates, edits, orders and deletes categories with their last-read versions", async () => {
    const api = createEditorApi(origin);

    status = 201;
    response = JSON.stringify(clinics);
    expect(await api.createCategory(categoryFields)).toEqual({ ok: true, value: clinics });
    expect(requests.at(-1)).toMatchObject({
      url: "/editor/categories",
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(requests.at(-1)?.headers["if-updated-at"]).toBeUndefined();
    expect(JSON.parse(requests.at(-1)?.body ?? "null")).toEqual(categoryFields);

    status = 200;
    expect(await api.updateCategory(clinics.id, categoryFields, clinics.updated_at)).toEqual({
      ok: true,
      value: clinics,
    });
    expect(requests.at(-1)).toMatchObject({
      url: `/editor/categories/${clinics.id}`,
      method: "PUT",
      headers: { "if-updated-at": clinics.updated_at },
    });

    const order = {
      parent_id: null,
      expected: [{ id: health.id, updated_at: health.updated_at }],
      ordered_ids: [health.id],
    };

    response = JSON.stringify({ categories: [health] });
    expect(await api.orderCategories(order)).toEqual({ ok: true, value: [health] });
    expect(requests.at(-1)).toMatchObject({ url: "/editor/categories/order", method: "PUT" });
    expect(JSON.parse(requests.at(-1)?.body ?? "null")).toEqual(order);

    status = 204;
    response = "";
    expect(await api.deleteCategory(clinics.id, clinics.updated_at)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(requests.at(-1)).toMatchObject({
      url: `/editor/categories/${clinics.id}`,
      method: "DELETE",
      headers: { "if-updated-at": clinics.updated_at },
    });
    expect(requests.at(-1)?.headers["content-type"]).toBeUndefined();
  });

  it("tells a stale category version from a category still in use", async () => {
    const api = createEditorApi(origin);

    status = 409;
    response = JSON.stringify({ error: "conflict", message: "These categories changed." });

    const stale = await api.updateCategory(health.id, categoryFields, health.updated_at);

    expect(stale.ok || stale.error).toBeInstanceOf(CategoryConflict);
    expect(stale).toMatchObject({
      ok: false,
      error: { status: 409, message: "These categories changed." },
    });

    const blockers = { pages: 3, subcategories: 1, reserved_route: false };

    response = JSON.stringify({ error: "category_in_use", message: "Still in use.", blockers });
    const inUse = await api.deleteCategory(health.id, health.updated_at);

    expect(inUse.ok || inUse.error).toBeInstanceOf(CategoryInUse);
    expect(inUse).toMatchObject({
      ok: false,
      error: { status: 409, message: "Still in use.", blockers },
    });

    // An order's stale snapshot is a conflict too
    response = JSON.stringify({ error: "conflict", message: "These categories changed." });
    expect(
      await api.orderCategories({ parent_id: null, expected: [], ordered_ids: [] }),
    ).toMatchObject({ ok: false, error: { _tag: "CategoryConflict" } });

    // Without its discriminator, a 409 is only a refusal
    response = JSON.stringify({ message: "No." });
    expect(await api.deleteCategory(health.id, health.updated_at)).toMatchObject({
      ok: false,
      error: { _tag: "CategoryRefused", status: 409, message: "No." },
    });

    // In use is a deletion's refusal only: an update can't be refused that way
    response = JSON.stringify({ error: "category_in_use", message: "Still in use.", blockers });
    expect(await api.updateCategory(health.id, categoryFields, health.updated_at)).toMatchObject({
      ok: false,
      error: { _tag: "CategoryRefused", status: 409 },
    });
  });

  it("returns refused fields, a missing category and an ended session as their own failures", async () => {
    const api = createEditorApi(origin);
    const errors = [{ field: "slug", message: "Another category already uses this slug." }];

    status = 422;
    response = JSON.stringify({ error: "validation_failed", message: "Not saved.", errors });
    expect(await api.createCategory(categoryFields)).toMatchObject({
      ok: false,
      error: { _tag: "CategoryRejected", status: 422, errors },
    });

    status = 404;
    response = JSON.stringify({ error: "not_found", message: "No category." });
    expect(await api.updateCategory(health.id, categoryFields, health.updated_at)).toMatchObject({
      ok: false,
      error: { _tag: "CategoryNotFound", status: 404 },
    });
    expect(await api.deleteCategory(health.id, health.updated_at)).toMatchObject({
      ok: false,
      error: { _tag: "CategoryNotFound" },
    });

    for (const denied of [401, 403]) {
      status = denied;
      response = JSON.stringify({ error: "forbidden", message: "No." });
      expect(await api.createCategory(categoryFields)).toMatchObject({
        ok: false,
        error: { _tag: "CategoryAccessDenied", status: denied },
      });
    }

    // A request the API couldn't read: refused
    status = 400;
    response = "";
    expect(await api.updateCategory(health.id, categoryFields, health.updated_at)).toMatchObject({
      ok: false,
      error: { _tag: "CategoryRefused", status: 400 },
    });
  });

  it("calls a category write's outcome unknown when its answer is lost or unreadable", async () => {
    const lost = createEditorApi("http://127.0.0.1:1");

    const writes: [CategoryOutcomeUnknown["operation"], Promise<{ ok: boolean }>][] = [
      ["create", lost.createCategory(categoryFields)],
      ["update", lost.updateCategory(health.id, categoryFields, health.updated_at)],
      ["order", lost.orderCategories({ parent_id: null, expected: [], ordered_ids: [] })],
      ["delete", lost.deleteCategory(health.id, health.updated_at)],
    ];

    for (const [operation, write] of writes)
      expect(await write).toMatchObject({
        ok: false,
        error: { _tag: "CategoryOutcomeUnknown", operation },
      });

    const api = createEditorApi(origin);

    // A server or gateway failure can follow a committed write: unknown, never refused
    for (const failedStatus of [500, 502, 503, 504]) {
      status = failedStatus;
      response = JSON.stringify({ error: "internal", message: "Try again." });

      const answers: [CategoryOutcomeUnknown["operation"], { ok: boolean }][] = [
        ["create", await api.createCategory(categoryFields)],
        ["update", await api.updateCategory(health.id, categoryFields, health.updated_at)],
        ["order", await api.orderCategories({ parent_id: null, expected: [], ordered_ids: [] })],
        ["delete", await api.deleteCategory(health.id, health.updated_at)],
      ];

      for (const [operation, answer] of answers)
        expect(answer).toMatchObject({
          ok: false,
          error: { _tag: "CategoryOutcomeUnknown", operation, cause: { status: failedStatus } },
        });
    }

    // An answer that says it saved, but can't be read, leaves the outcome unknown too

    status = 201;
    response = '{"id":';

    const created = await api.createCategory(categoryFields);

    expect(created.ok || created.error).toBeInstanceOf(CategoryOutcomeUnknown);
    expect(created).toMatchObject({ ok: false, error: { operation: "create" } });

    status = 200;
    response = JSON.stringify({ categories: [{ ...health, id: "health" }] });
    expect(
      await api.orderCategories({ parent_id: null, expected: [], ordered_ids: [] }),
    ).toMatchObject({ ok: false, error: { _tag: "CategoryOutcomeUnknown", operation: "order" } });
  });

  it("requires valid response fields before exposing a page baseline", async () => {
    const { version: _version, ...oldPage } = page;
    response = JSON.stringify(oldPage);
    expect(await createEditorApi(origin).page(id)).toEqual({
      ok: false,
      error: { kind: "invalid-response" },
    });
    response = JSON.stringify({ ...page, version: "2" });
    expect(await createEditorApi(origin).page(id)).toEqual({
      ok: false,
      error: { kind: "invalid-response" },
    });
  });

  it.each([
    ["page_version_conflict", "version-conflict"],
    ["page_edit_lock_lost", "lock-lost"],
    ["page_edit_lock_required", "lock-required"],
    ["page_edit_lock_conflict", "lock-conflict"],
  ])("preserves the distinct 409 code %s", async (code, kind) => {
    status = 409;
    response = JSON.stringify({ error: code, pageId: id });
    expect(await createEditorApi(origin).savePage(id, fields, token)).toEqual({
      ok: false,
      error: { kind, pageId: id },
    });
  });

  it("does not mistake an old or unknown 409 envelope for a content conflict", async () => {
    status = 409;
    response = JSON.stringify({ error: "conflict", documentId: id });
    expect(await createEditorApi(origin).savePage(id, fields, token)).toEqual({
      ok: false,
      error: { kind: "invalid-response" },
    });
  });

  it("returns field refusals as values without exposing arbitrary response messages", async () => {
    status = 422;
    response = JSON.stringify({
      error: "validation_failed",
      errors: [{ field: "url", message: "Taken" }],
    });
    expect(await createEditorApi(origin).createPage(fields)).toEqual({
      ok: false,
      error: { kind: "invalid", errors: [{ field: "url", message: "Taken" }] },
    });
  });

  it.each([
    [401, "signed-out"],
    [403, "forbidden"],
    [404, "missing"],
    [503, "unavailable"],
  ])("classifies page-read status %s", async (code, kind) => {
    status = Number(code);
    response = "not json";
    expect(await createEditorApi(origin).page(id)).toEqual({ ok: false, error: { kind } });
  });

  it("treats an unreadable success after a write as uncertain and does not retry it", async () => {
    response = "not json";
    expect(await createEditorApi(origin).savePage(id, fields, token)).toEqual({
      ok: false,
      error: { kind: "outcome-unknown" },
    });
    expect(requests).toHaveLength(1);
  });

  it("distinguishes failed reads from uncertain writes on a network failure", async () => {
    const api = createEditorApi("http://127.0.0.1:1");
    expect(await api.page(id)).toEqual({ ok: false, error: { kind: "unavailable" } });
    expect(await api.savePage(id, fields, token)).toEqual({
      ok: false,
      error: { kind: "outcome-unknown" },
    });
  });

  it("converts page-read failures to rejection only at the query adapter", async () => {
    status = 401;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    try {
      await expect(client.fetchQuery(pageQuery(createEditorApi(origin), id))).rejects.toMatchObject(
        { status: 401 },
      );
    } finally {
      client.clear();
    }
  });

  it("uses separate acquire, renew and release commands and validates presence", async () => {
    response = JSON.stringify(lock);
    const api = createEditorApi(origin);

    const command = {
      action: "takeover" as const,
      expectedLockGeneration: pageEditLockGenerationSchema.parse(0),
    };

    expect((await api.acquirePageEditLock(id, token, command)).ok).toBe(true);
    expect(JSON.parse(requests.at(-1)?.body ?? "null")).toEqual(command);
    expect(
      (await api.renewPageEditLock(id, token, pageEditActivitySequenceSchema.parse(7))).ok,
    ).toBe(true);
    expect(requests.at(-1)?.method).toBe("PUT");
    expect(JSON.parse(requests.at(-1)?.body ?? "null")).toEqual({ activitySequence: 7 });
    expect(await api.releasePageEditLock(id, token)).toEqual({ ok: true, value: undefined });
    expect(requests.at(-1)?.url).toBe(`/pages/${id}/lock`);
    response = JSON.stringify({ ...lock, lockExpiresAt: "tomorrow" });
    expect(await api.readPageEditLock(id, token)).toEqual({
      ok: false,
      error: { kind: "invalid-response" },
    });
    expect(JSON.stringify(token)).not.toContain(credential);
  });
});

describe("unchanged navigation reads", () => {
  it("keeps service listing responses unwrapped", async () => {
    response = JSON.stringify([{ id, title: "Fees" }]);
    expect(await createEditorApi(origin).services()).toEqual([{ id, title: "Fees" }]);
  });
  it("keeps the existing rejection contract for list failures", async () => {
    status = 500;
    response = "not json";
    await expect(createEditorApi(origin).version()).rejects.toMatchObject({
      status: 500,
      errors: [],
    });
    await expect(createEditorApi("http://127.0.0.1:1").services()).rejects.toBeInstanceOf(
      ApiFailure,
    );
  });
});
