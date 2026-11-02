import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresPages } from "./adapters/postgres-pages";
import { PageFields } from "./modules/page";
import { ok } from "./modules/result";
import { seed } from "./seed";
import {
  aPage,
  createTestApp,
  createTestDb,
  expectOk,
  TEST_EDITOR,
  TEST_EMPLOYEE,
  TEST_HEADERS,
  type TestDb,
} from "./test-db";

const PAGE = "55555555-5555-4555-8555-555555555555";
const CATEGORY = "33333333-3333-4333-8333-333333333333";
const author = { id: TEST_EMPLOYEE.id, name: TEST_EMPLOYEE.name };
const otherAuthor = { id: TEST_EDITOR.id, name: TEST_EDITOR.name };
const system = { id: "system", name: "System" };
let test: TestDb;
let app: FastifyInstance;
let employee = TEST_EMPLOYEE;

beforeEach(async () => {
  test = await createTestDb();
  employee = TEST_EMPLOYEE;
  app = await createTestApp(test.db, {
    allowSelfApproval: true,
    sessions: { findSession: async () => ok(employee) },
  });
});
afterEach(async () => {
  await app.close();
  await test.close();
});

const readPage = async (id: string) => {
  const response = await app.inject({
    url: `/pages/${id}`,
    headers: TEST_HEADERS,
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json();
};
const createPage = async (overrides = {}) => {
  const response = await app.inject({
    method: "POST",
    url: "/pages",
    headers: TEST_HEADERS,
    payload: aPage({ visibility: "draft", ...overrides }),
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json();
};
const categoryFields = (slug: string, parent_id: string | null = null) => ({
  title: slug,
  slug,
  parent_id,
  description: null,
});

// Check nested objects too: a public category response contains other categories and pages.
function expectNoAttribution(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(expectNoAttribution);
  } else if (value !== null && typeof value === "object") {
    expect(value).not.toHaveProperty("last_edited_by");
    expect(value).not.toHaveProperty("actor");
    expect(value).not.toHaveProperty("actor_name");
    Object.values(value).forEach(expectNoAttribution);
  } else {
    expect([
      author.id,
      author.name,
      otherAuthor.id,
      otherAuthor.name,
    ]).not.toContain(value);
  }
}

describe("editor last_edited_by", () => {
  it("reads the latest signed-in saver, while a no-op preserves attribution and version", async () => {
    const page = await createPage();
    expect(page.last_edited_by).toEqual(author);
    employee = TEST_EDITOR;
    const fields = {
      ...PageFields.parse(page),
      title: "Changed by another editor",
    };
    const saved = await app.inject({
      method: "PUT",
      url: `/pages/${page.id}`,
      headers: TEST_HEADERS,
      payload: fields,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().last_edited_by).toEqual(otherAuthor);
    expect((await readPage(page.id)).last_edited_by).toEqual(otherAuthor);

    const before = (
      await app.inject({ url: "/version", headers: TEST_HEADERS })
    ).json();
    employee = TEST_EMPLOYEE;
    const unchanged = await app.inject({
      method: "PUT",
      url: `/pages/${page.id}`,
      headers: TEST_HEADERS,
      payload: fields,
    });
    expect(unchanged.statusCode).toBe(200);
    expect(unchanged.json().last_edited_by).toEqual(otherAuthor);
    expect(unchanged.json().updated_at).toBe(saved.json().updated_at);
    expect(
      (await app.inject({ url: "/version", headers: TEST_HEADERS })).json(),
    ).toEqual(before);
  });

  it("uses version order when events share a timestamp, scoped to the entity kind", async () => {
    await test.db.transaction(async (tx) => {
      await tx.execute(sql`insert into content_pages (id, url, slug, title, body_markdown)
        values (${PAGE}, '/ordered', 'ordered', 'First', '')`);
      await tx.execute(
        sql`select set_config('app.user_id', ${TEST_EMPLOYEE.id}, true)`,
      );
      await tx.execute(
        sql`update content_pages set title = 'Second' where id = ${PAGE}`,
      );
      await tx.execute(
        sql`select set_config('app.user_id', ${TEST_EDITOR.id}, true)`,
      );
      await tx.execute(
        sql`update content_pages set title = 'Third' where id = ${PAGE}`,
      );
      await tx.execute(
        sql`select set_config('app.user_id', ${TEST_EMPLOYEE.id}, true)`,
      );
      await tx.execute(
        sql`insert into categories (id, slug, title) values (${PAGE}, 'same-id', 'Other entity')`,
      );
    });
    const events = await test.db.execute<{ at: string }>(sql`
      select occurred_at::text as at from change_events where entity_kind = 'content_page' and entity_id = ${PAGE}`);
    expect(events.rows).toHaveLength(3);
    expect(new Set(events.rows.map((event) => event.at)).size).toBe(1);
    expect((await readPage(PAGE)).last_edited_by).toEqual(otherAuthor);
  });

  it("returns System for actual seeded pages and categories", async () => {
    await seed(test.db);
    const pages = await test.db.execute<{ id: string }>(
      sql`select id from content_pages limit 1`,
    );
    expect(
      (await readPage((pages.rows[0] ?? expect.unreachable()).id))
        .last_edited_by,
    ).toEqual(system);
    const response = await app.inject({
      url: "/editor/categories",
      headers: TEST_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().categories.length).toBeGreaterThan(0);
    for (const category of response.json().categories)
      expect(category.last_edited_by).toEqual(system);
  });

  it("returns null, not System, for existing entities without history", async () => {
    // Only this disposable database: simulate rows predating recorded history.
    await test.db.transaction(async (tx) => {
      await tx.execute(
        sql`alter table content_pages disable trigger content_pages_record_change`,
      );
      await tx.execute(
        sql`alter table categories disable trigger categories_record_change`,
      );
      await tx.execute(sql`insert into content_pages (id, url, slug, title, body_markdown)
        values (${PAGE}, '/unrecorded', 'unrecorded', 'Unrecorded', '')`);
      await tx.execute(
        sql`insert into categories (id, slug, title) values (${CATEGORY}, 'unrecorded-category', 'Unrecorded category')`,
      );
      await tx.execute(
        sql`alter table content_pages enable trigger content_pages_record_change`,
      );
      await tx.execute(
        sql`alter table categories enable trigger categories_record_change`,
      );
    });
    expect((await readPage(PAGE)).last_edited_by).toBeNull();
    const response = await app.inject({
      url: "/editor/categories",
      headers: TEST_HEADERS,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().categories[0].last_edited_by).toBeNull();
  });

  it("keeps an existing actor with a null name when its profile is unavailable, as history does", async () => {
    const page = await createPage();
    // Current accounts with history cannot be deleted. This disposable DB models older orphaned history.
    await test.db.execute(
      sql`alter table change_events drop constraint change_events_actor_fkey`,
    );
    await test.db
      .execute(sql`insert into change_events (entity_kind, entity_id, version_no, action, snapshot, actor)
      values ('content_page', ${page.id}, 2, 'updated', '{}', 'former-employee')`);
    expect((await readPage(page.id)).last_edited_by).toEqual({
      id: "former-employee",
      name: null,
    });
    const history = await app.inject({
      url: `/pages/${page.id}/history`,
      headers: TEST_HEADERS,
    });
    expect(history.json().entries[0]).toMatchObject({
      actor: "former-employee",
      actor_name: null,
    });
  });

  it("attributes review events, not unrecorded pending-revision saves, without changing their versions", async () => {
    const page = await createPage({ visibility: "public" });
    employee = TEST_EDITOR;
    const saved = await app.inject({
      method: "PUT",
      url: `/pages/${page.id}`,
      headers: TEST_HEADERS,
      payload: { ...PageFields.parse(page), title: "Pending content" },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().pending_revision.status).toBe("draft");
    expect(saved.json().last_edited_by).toEqual(author);
    expect(saved.json().updated_at).not.toBe(page.updated_at);
    expect((await readPage(page.id)).last_edited_by).toEqual(author);

    const submitted = await app.inject({
      method: "POST",
      url: `/pages/${page.id}/revision/submit`,
      headers: { ...TEST_HEADERS, "if-updated-at": saved.json().updated_at },
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    const afterSubmit = await readPage(page.id);
    expect(afterSubmit.last_edited_by).toEqual(otherAuthor);
    expect(afterSubmit.updated_at).toBe(saved.json().updated_at);

    employee = TEST_EMPLOYEE;
    const rejected = await app.inject({
      method: "POST",
      url: `/pages/${page.id}/revision/reject`,
      headers: {
        ...TEST_HEADERS,
        "if-updated-at": submitted.json().updated_at,
      },
      payload: { comment: "Needs another edit" },
    });
    expect(rejected.statusCode, rejected.body).toBe(200);
    const afterReject = await readPage(page.id);
    expect(afterReject.last_edited_by).toEqual(author);
    expect(afterReject.updated_at).toBe(rejected.json().updated_at);
    expect(afterReject.pending_revision).toEqual({
      status: "rejected",
      comment: "Needs another edit",
    });

    const history = await app.inject({
      url: `/pages/${page.id}/history`,
      headers: TEST_HEADERS,
    });
    expect(
      history.json().entries.map((entry: { action: string }) => entry.action),
    ).toEqual(["rejected", "submitted", "created"]);
  });

  it("returns category and subcategory authors after create, update and reorder in one list query", async () => {
    const create = async (slug: string, parent: string | null = null) => {
      const response = await app.inject({
        method: "POST",
        url: "/editor/categories",
        headers: TEST_HEADERS,
        payload: categoryFields(slug, parent),
      });
      expect(response.statusCode, response.body).toBe(201);
      expect(response.json().last_edited_by).toEqual(author);
      return response.json();
    };
    const parent = await create("parent");
    const child = await create("child", parent.id);
    const sibling = await create("sibling", parent.id);
    await test.db.execute(
      sql`insert into user_roles (user_id, role) values (${TEST_EDITOR.id}, 'approver')`,
    );
    employee = TEST_EDITOR;
    const updated = await app.inject({
      method: "PUT",
      url: `/editor/categories/${child.id}`,
      headers: { ...TEST_HEADERS, "if-updated-at": child.updated_at },
      payload: {
        ...categoryFields(child.slug, parent.id),
        title: "Renamed child",
      },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().last_edited_by).toEqual(otherAuthor);
    const reordered = await app.inject({
      method: "PUT",
      url: "/editor/categories/order",
      headers: TEST_HEADERS,
      payload: {
        parent_id: parent.id,
        expected: [updated.json(), sibling].map(({ id, updated_at }) => ({
          id,
          updated_at,
        })),
        ordered_ids: [sibling.id, child.id],
      },
    });
    expect(reordered.statusCode, reordered.body).toBe(200);
    for (const row of reordered.json().categories)
      expect(row.last_edited_by).toEqual(otherAuthor);

    const logQuery = vi.fn();
    const rows = expectOk(
      await new PostgresPages(
        drizzle(test.pool, { logger: { logQuery } }),
      ).editorCategories(),
    );
    expect(logQuery).toHaveBeenCalledTimes(1);
    expect(rows.find((row) => row.id === parent.id)?.last_edited_by).toEqual(
      author,
    );
    expect(rows.find((row) => row.id === child.id)?.last_edited_by).toEqual(
      otherAuthor,
    );
    expect(rows.find((row) => row.id === sibling.id)?.last_edited_by).toEqual(
      otherAuthor,
    );

    employee = TEST_EMPLOYEE;
    const latest =
      rows.find((row) => row.id === child.id) ?? expect.unreachable();
    const unchanged = await app.inject({
      method: "PUT",
      url: `/editor/categories/${child.id}`,
      headers: { ...TEST_HEADERS, "if-updated-at": latest.updated_at },
      payload: {
        ...categoryFields(child.slug, parent.id),
        title: "Renamed child",
      },
    });
    expect(unchanged.statusCode).toBe(200);
    expect(unchanged.json()).toMatchObject({
      updated_at: latest.updated_at,
      last_edited_by: otherAuthor,
    });
  });

  it("never exposes attribution on public routes, including nested data and authenticated callers", async () => {
    const parent = await app.inject({
      method: "POST",
      url: "/editor/categories",
      headers: TEST_HEADERS,
      payload: categoryFields("parent"),
    });
    const child = await app.inject({
      method: "POST",
      url: "/editor/categories",
      headers: TEST_HEADERS,
      payload: categoryFields("child", parent.json().id),
    });
    const page = await createPage({
      url: "/parent/child/page",
      category_id: child.json().id,
      visibility: "public",
    });
    expect((await readPage(page.id)).last_edited_by).toEqual(author);
    for (const headers of [{}, TEST_HEADERS]) {
      for (const url of [
        "/pages?url=/parent/child/page",
        "/categories",
        "/categories/parent",
        "/categories/parent/child",
        "/catalog",
        "/search/documents",
      ]) {
        const response = await app.inject({ url, headers });
        expect(response.statusCode, url).toBe(200);
        expectNoAttribution(response.json());
      }
    }
  });
});
