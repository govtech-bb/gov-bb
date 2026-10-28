import { randomUUID } from "node:crypto";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createTestApp,
  createTestDb,
  TEST_HEADERS,
  type TestDb,
} from "./test-db";
import { RESERVED_CATEGORY_PATHS } from "./modules/category";
import { AuthUnavailable, Forbidden } from "./modules/auth";
import { err } from "./modules/result";

const categoryResponse = z.strictObject({
  id: z.guid(),
  parent_id: z.guid().nullable(),
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  position: z.int().nonnegative(),
  services: z.int().nonnegative(),
  reserved_route: z.boolean(),
  updated_at: z.iso.datetime({ precision: 3 }),
});
type Category = z.infer<typeof categoryResponse>;
let test: TestDb;
let app: FastifyInstance;

beforeEach(async () => {
  test = await createTestDb();
  app = await createTestApp(test.db);
});
afterEach(async () => {
  await app.close();
  await test.close();
});

const request = (options: InjectOptions) =>
  app.inject({ ...options, headers: { ...TEST_HEADERS, ...options.headers } });
const fields = (slug: string, parent_id: string | null = null) => ({
  title: slug,
  slug,
  parent_id,
  description: null,
});
async function create(
  slug: string,
  parent_id: string | null = null,
): Promise<Category> {
  const response = await request({
    method: "POST",
    url: "/editor/categories",
    payload: fields(slug, parent_id),
  });
  expect(response.statusCode, response.body).toBe(201);
  return categoryResponse.parse(response.json());
}
const save = (category: Category, changes: object = {}) =>
  request({
    method: "PUT",
    url: `/editor/categories/${category.id}`,
    headers: { "if-updated-at": category.updated_at },
    payload: {
      ...fields(category.slug, category.parent_id),
      title: category.title,
      description: category.description,
      ...changes,
    },
  });
const remove = (category: Category) =>
  request({
    method: "DELETE",
    url: `/editor/categories/${category.id}`,
    headers: { "if-updated-at": category.updated_at },
  });
async function list(): Promise<Category[]> {
  const response = await request({ url: "/editor/categories" });
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.headers.etag).toBeUndefined();
  return z
    .object({ categories: z.array(categoryResponse) })
    .parse(response.json()).categories;
}
const order = (
  siblings: Category[],
  ordered_ids = siblings.map((row) => row.id).reverse(),
  parent_id: string | null = null,
) =>
  request({
    method: "PUT",
    url: "/editor/categories/order",
    payload: {
      parent_id,
      expected: siblings.map(({ id, updated_at }) => ({ id, updated_at })),
      ordered_ids,
    },
  });
async function page(
  url: string,
  category_id: string | null,
  extra: object = {},
) {
  const response = await request({
    method: "POST",
    url: "/pages",
    payload: {
      url,
      category_id,
      title: "Service",
      body_markdown: "Content",
      ...extra,
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json();
}

describe("editor categories", () => {
  it("persists canonical fields, lists parents before children, and retires taxonomy", async () => {
    const parent = await create("education");
    const second = await create("health");
    const child = await create("schools", parent.id);
    const response = await save(child, {
      title: "  Schools  ",
      description: "  ",
    });
    expect(response.statusCode).toBe(200);
    const saved = categoryResponse.parse(response.json());
    expect(saved).toMatchObject({
      title: "Schools",
      description: null,
      url: "/education/schools",
      position: 0,
    });
    expect(Date.parse(saved.updated_at)).toBeGreaterThan(
      Date.parse(child.updated_at),
    );
    expect((await list()).map((row) => row.id)).toEqual([
      parent.id,
      child.id,
      second.id,
    ]);
    expect((await request({ url: "/taxonomy" })).statusCode).toBe(404);
    expect(app.swagger().paths).not.toHaveProperty("/taxonomy");
    const version = await request({ url: "/version" });
    expect(version.json()).toEqual({ count: 0, latest: null });
    const another = await createTestApp(test.db);
    try {
      expect(
        (
          await another.inject({
            url: "/editor/categories",
            headers: TEST_HEADERS,
          })
        ).json(),
      ).toEqual({ categories: await list() });
    } finally {
      await another.close();
    }
  });

  it("trims descriptions, permits repeated titles and appends moves without touching siblings", async () => {
    const root = await create("root");
    const other = await create("other");
    const child = await create("child", root.id);
    const destination = await create("destination", other.id);
    const moved = await save(child, {
      parent_id: other.id,
      title: destination.title,
      description: "  Helpful  ",
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({
      url: "/other/child",
      position: 1,
      title: "destination",
      description: "Helpful",
    });
    expect((await list()).find((row) => row.id === destination.id)).toEqual(
      destination,
    );
    expect((await request({ url: "/categories/root/child" })).statusCode).toBe(
      404,
    );
    expect(
      (await remove(categoryResponse.parse(moved.json()))).statusCode,
    ).toBe(204);
  });

  it.each([
    { title: 3 },
    { parent_id: "bad" },
    { slug: null },
    { description: 3 },
    { extra: true },
  ])(
    "refuses malformed field representations with 400: %j",
    async (changes) => {
      const response = await request({
        method: "POST",
        url: "/editor/categories",
        payload: { ...fields("valid"), ...changes },
      });
      expect(response.statusCode).toBe(400);
      expect(await list()).toEqual([]);
    },
  );

  it.each([
    ["title", "   "],
    ["title", "a".repeat(201)],
    ["slug", ""],
    ["slug", "a".repeat(101)],
    ["slug", "Upper"],
    ["slug", "two--words"],
    ["slug", "robots.txt"],
    ["slug", "sitemap.xml"],
  ])("returns actionable 422 for %s=%s", async (field, value) => {
    const response = await request({
      method: "POST",
      url: "/editor/categories",
      payload: { ...fields("valid"), [field]: value },
    });
    expect(response.statusCode, response.body).toBe(422);
    expect(response.json()).toMatchObject({
      error: "validation_failed",
      errors: [{ field, message: expect.any(String) }],
    });
  });

  it("refuses duplicate global slugs and invalid parents", async () => {
    const root = await create("root");
    const child = await create("child", root.id);
    for (const input of [
      fields("root", root.id),
      fields("missing", randomUUID()),
      fields("third", child.id),
    ]) {
      expect(
        (
          await request({
            method: "POST",
            url: "/editor/categories",
            payload: input,
          })
        ).statusCode,
      ).toBe(422);
    }
    expect((await save(child, { parent_id: child.id })).statusCode).toBe(422);
    expect((await save(root, { parent_id: child.id })).statusCode).toBe(422);
    expect((await save(root, { slug: "moved" })).statusCode).toBe(422);
    expect((await remove(root)).json()).toMatchObject({
      error: "category_in_use",
      blockers: { pages: 0, subcategories: 1, reserved_route: false },
    });
  });

  it.each([undefined, "bad", "2026-10-26T12:00:00.000001Z"])(
    "requires a valid millisecond precondition: %s",
    async (stamp) => {
      const category = await create("root");
      for (const method of ["PUT", "DELETE"] as const) {
        const response = await request({
          method,
          url: `/editor/categories/${category.id}`,
          ...(method === "PUT" ? { payload: fields("root") } : {}),
          headers: stamp === undefined ? {} : { "if-updated-at": stamp },
        });
        expect(response.statusCode, response.body).toBe(400);
      }
      expect(await list()).toEqual([category]);
    },
  );

  it("compares UUIDs by identity rather than hexadecimal casing", async () => {
    const parent = await create("parent");
    const child = await create("child", parent.id.toUpperCase());
    expect(child.parent_id).toBe(parent.id);
    const saved = await save(
      { ...child, id: child.id.toUpperCase() },
      { title: "Changed" },
    );
    expect(saved.statusCode).toBe(200);
    const current = categoryResponse.parse(saved.json());
    const response = await request({
      method: "PUT",
      url: "/editor/categories/order",
      payload: {
        parent_id: parent.id.toUpperCase(),
        expected: [
          { id: current.id.toUpperCase(), updated_at: current.updated_at },
        ],
        ordered_ids: [current.id],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ categories: [current] });
    expect(
      (await remove({ ...current, id: current.id.toUpperCase() })).statusCode,
    ).toBe(204);
  });

  it("refuses stale save/delete and returns 404 after deletion", async () => {
    const category = await create("root");
    const saved = categoryResponse.parse(
      (await save(category, { title: "Changed" })).json(),
    );
    for (const response of [await save(category), await remove(category)]) {
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: "conflict",
        message: expect.any(String),
      });
    }
    expect((await remove(saved)).statusCode).toBe(204);
    expect((await remove(saved)).statusCode).toBe(404);
    expect((await save(saved)).statusCode).toBe(404);
  });

  it("reorders complete snapshots atomically and invalidates changed-row dialogs", async () => {
    const a = await create("a");
    const b = await create("b");
    const c = await create("c");
    const response = await order([a, b, c]);
    expect(response.statusCode, response.body).toBe(200);
    expect(Object.keys(response.json())).toEqual(["categories"]);
    const rows = z.array(categoryResponse).parse(response.json().categories);
    expect(rows.map(({ id, position }) => [id, position])).toEqual([
      [c.id, 0],
      [b.id, 1],
      [a.id, 2],
    ]);
    expect(rows[1]).toEqual(b);
    expect((await save(a)).statusCode).toBe(409);
    expect((await order([a, b, c])).statusCode).toBe(409);
    expect(
      (
        await order(
          rows,
          rows.map((row) => row.id),
        )
      ).json(),
    ).toEqual({ categories: rows });
  });

  it("persists every permutation of three siblings without losing membership", async () => {
    const initial = [await create("a"), await create("b"), await create("c")];
    const ids = initial.map((row) => row.id);
    let current = initial;
    for (const a of ids)
      for (const b of ids)
        for (const c of ids) {
          const ordered = [a, b, c];
          if (new Set(ordered).size !== 3) continue;
          const response = await order(current, ordered);
          expect(response.statusCode, response.body).toBe(200);
          current = z.array(categoryResponse).parse(response.json().categories);
          expect(current.map((row) => row.id)).toEqual(ordered);
          expect(current.map((row) => row.position)).toEqual([0, 1, 2]);
          expect(await list()).toEqual(current);
        }
  });

  it("distinguishes invalid permutations from stale membership and stamps", async () => {
    const a = await create("a");
    const b = await create("b");
    expect((await order([a, b], [a.id, a.id])).statusCode).toBe(422);
    expect((await order([a, b], [a.id])).statusCode).toBe(422);
    expect((await order([a, b], [a.id, randomUUID()])).statusCode).toBe(422);
    expect((await order([a, a], [a.id, a.id])).statusCode).toBe(422);
    expect((await order([a])).statusCode).toBe(409);
    await save(b, { title: "Edited" });
    expect((await order([a, b])).statusCode).toBe(409);
    expect((await list()).map((row) => row.id)).toEqual([a.id, b.id]);
  });

  it("allows empty groups but refuses reorder transport errors", async () => {
    expect((await order([])).json()).toEqual({ categories: [] });
    for (const payload of [
      { parent_id: null, expected: [], ordered_ids: [], extra: true },
      {
        parent_id: null,
        expected: [{ id: randomUUID(), updated_at: "bad" }],
        ordered_ids: [],
      },
      { parent_id: null, ordered_ids: [] },
    ])
      expect(
        (
          await request({
            method: "PUT",
            url: "/editor/categories/order",
            payload,
          })
        ).statusCode,
      ).toBe(400);
  });

  it("counts service roots like /services but blocks deletion on every page", async () => {
    const category = await create("education");
    const child = await create("schools", category.id);
    for (const visibility of ["draft", "preview", "public"]) {
      const root = await page(`/education/${visibility}`, category.id, {
        visibility,
      });
      await page(`/education/${visibility}/support`, category.id, {
        parent_id: root.id,
        visibility,
      });
    }
    await page("/education/schools/entry", child.id);
    const rows = await list();
    const services = (await request({ url: "/services" })).json();
    for (const row of rows)
      expect(row.services).toBe(
        services.filter(
          (service: { category: { slug: string } }) =>
            service.category.slug === row.slug,
        ).length,
      );
    expect(rows.find((row) => row.id === category.id)?.services).toBe(3);
    const blocked = await remove(category);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({
      error: "category_in_use",
      blockers: { pages: 6, subcategories: 1, reserved_route: false },
    });
    expect((await save(child, { slug: "renamed" })).statusCode).toBe(422);
    expect((await save(child, { parent_id: null })).statusCode).toBe(422);
    expect((await save(category, { title: "New name" })).statusCode).toBe(200);
    const publicRead = await request({ url: "/categories" });
    expect(publicRead.json()).toEqual({
      categories: [
        {
          slug: "education",
          title: "New name",
          description: null,
          url: "/education",
          subcategories: [],
        },
      ],
    });
    expect(publicRead.headers["cache-control"]).toContain("max-age=60");
  });

  it("refuses page/category URL collisions in both write directions", async () => {
    await page("/taken", null);
    const candidate = await create("candidate");
    expect((await save(candidate, { slug: "taken" })).statusCode).toBe(422);
    expect(
      (
        await request({
          method: "POST",
          url: "/editor/categories",
          payload: fields("taken"),
        })
      ).statusCode,
    ).toBe(422);
    const root = await create("root");
    await page("/root/candidate", null);
    expect((await save(candidate, { parent_id: root.id })).statusCode).toBe(
      422,
    );
    const existing = await page("/page", null);
    for (const method of ["POST", "PUT"] as const) {
      const response = await request({
        method,
        url: method === "POST" ? "/pages" : `/pages/${existing.id}`,
        payload: { ...existing, url: candidate.url },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ errors: [{ field: "url" }] });
    }
  });

  it("enforces every app reservation on creation and address-changing updates", async () => {
    for (const [index, path] of RESERVED_CATEGORY_PATHS.entries()) {
      const parts = path.slice(1).split("/");
      const rootSlug = parts[0];
      if (!rootSlug) throw new Error("Reservation must have a root");
      const childSlug = parts[1];
      const parent = childSlug
        ? ((await list()).find((row) => row.slug === rootSlug) ??
          (await create(rootSlug)))
        : null;
      const slug = childSlug ?? rootSlug;
      const input = fields(slug, parent?.id ?? null);
      expect(
        (
          await request({
            method: "POST",
            url: "/editor/categories",
            payload: input,
          })
        ).statusCode,
        path,
      ).toBe(422);
      const candidate = await create(`candidate-${index}`);
      expect((await save(candidate, input)).statusCode, path).toBe(422);
      if (parent) {
        const root = await create(slug);
        expect(
          (await save(root, { parent_id: parent.id })).statusCode,
          path,
        ).toBe(422);
        await remove(root);
        // These addresses may remain content pages leading into app-owned flows.
        await page(path, parent.id);
      }
    }
  });

  it("protects empty anchors and missing anchor slugs without freezing display names", async () => {
    const other = await create("other");
    const anchors = [
      "business-trade",
      "health-and-emergency-services",
      "money-financial-support",
      "pensions-and-gratuities",
    ];
    for (const slug of anchors) {
      expect(
        (
          await request({
            method: "POST",
            url: "/editor/categories",
            payload: fields(slug, other.id),
          })
        ).statusCode,
      ).toBe(422);
      const anchor = await create(slug);
      expect(anchor.reserved_route).toBe(true);
      expect((await save(anchor, { slug: `${slug}-moved` })).statusCode).toBe(
        422,
      );
      expect((await save(anchor, { parent_id: other.id })).statusCode).toBe(
        422,
      );
      const deletion = await remove(anchor);
      expect(deletion.statusCode).toBe(409);
      expect(deletion.json()).toEqual({
        error: "category_in_use",
        message: expect.any(String),
        blockers: { pages: 0, subcategories: 0, reserved_route: true },
      });
      const saved = await save(anchor, {
        title: "Renamed",
        description: "Changed",
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({
        reserved_route: true,
        url: anchor.url,
        title: "Renamed",
      });
    }
    expect((await order(await list())).statusCode).toBe(200);
  });

  it("preserves existing page resolution at a vacated category address", async () => {
    const category = await create("training");
    await page("/other/training", null, { visibility: "public" });
    expect((await save(category, { slug: "education" })).statusCode).toBe(200);
    expect((await request({ url: "/categories/training" })).statusCode).toBe(
      404,
    );
    expect((await request({ url: "/pages?url=/training" })).statusCode).toBe(
      301,
    );
  });

  it.each([undefined, "null", "https://evil.example"])(
    "enforces Origin on every category write: %s",
    async (origin) => {
      for (const [method, url] of [
        ["POST", "/editor/categories"],
        ["PUT", "/editor/categories/order"],
        ["PUT", "/editor/categories/bad-id"],
        ["DELETE", "/editor/categories/bad-id"],
      ] as const) {
        const response = await app.inject({
          method,
          url,
          headers: {
            cookie: TEST_HEADERS.cookie,
            ...(origin === undefined ? {} : { origin }),
          },
        });
        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ error: "forbidden" });
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.headers.etag).toBeUndefined();
      }
      expect(await list()).toEqual([]);
    },
  );

  it.each([
    [new Forbidden(), 403, "forbidden"],
    [new AuthUnavailable(), 503, "auth_unavailable"],
  ] as const)(
    "translates employee gate failure %s",
    async (failure, status, error) => {
      const restricted = await createTestApp(test.db, {
        sessions: { findSession: async () => err(failure) },
      });
      try {
        for (const [method, url] of [
          ["GET", "/editor/categories"],
          ["POST", "/editor/categories"],
          ["PUT", "/editor/categories/order"],
          ["PUT", "/editor/categories/bad-id"],
          ["DELETE", "/editor/categories/bad-id"],
        ] as const) {
          const response = await restricted.inject({
            method,
            url,
            headers: TEST_HEADERS,
          });
          expect(response.statusCode).toBe(status);
          expect(response.json()).toEqual({ error });
          expect(response.headers["cache-control"]).toBe("no-store");
        }
      } finally {
        await restricted.close();
      }
    },
  );

  it("keeps malformed JSON and missing fields separate from field-rule refusals", async () => {
    for (const payload of ["{", JSON.stringify({ title: "Missing fields" })]) {
      const response = await request({
        method: "POST",
        url: "/editor/categories",
        headers: { "content-type": "application/json" },
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    const category = await create("valid");
    expect(
      (await save(category, { description: "x".repeat(5000) })).statusCode,
    ).toBe(200);
  });

  it("translates malformed stored category data safely instead of returning invented metadata", async () => {
    await create("valid");
    await test.pool.query("update categories set title = ''");
    const response = await request({ url: "/editor/categories" });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error" });
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
