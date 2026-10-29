import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CategoryStamp,
  EditorCategory,
  type CategoryId,
  type CategoryOrder,
} from "./modules/category";
import { PostgresPages } from "./adapters/postgres-pages";
import { CategoryEditing } from "./services/category-editing";
import {
  createTestApp,
  createTestDb,
  expectOk,
  TEST_EMPLOYEE,
  TEST_HEADERS,
  type TestDb,
} from "./test-db";

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
const fields = (slug: string, parent_id: CategoryId | null = null) => ({
  title: slug,
  slug,
  parent_id,
  description: null,
});
const post = (slug: string, parent_id: CategoryId | null = null) =>
  request({
    method: "POST",
    url: "/editor/categories",
    payload: fields(slug, parent_id),
  });
async function create(
  slug: string,
  parent_id: CategoryId | null = null,
): Promise<EditorCategory> {
  const response = await post(slug, parent_id);
  expect(response.statusCode, response.body).toBe(201);
  return EditorCategory.parse(response.json());
}
const save = (row: EditorCategory, changes: object = {}) =>
  request({
    method: "PUT",
    url: `/editor/categories/${row.id}`,
    payload: {
      ...fields(row.slug, row.parent_id),
      title: row.title,
      description: row.description,
      ...changes,
    },
    headers: { "if-updated-at": row.updated_at },
  });
const remove = (row: EditorCategory) =>
  request({
    method: "DELETE",
    url: `/editor/categories/${row.id}`,
    headers: { "if-updated-at": row.updated_at },
  });
const orderBody = (rows: EditorCategory[]): CategoryOrder => ({
  parent_id: rows[0]?.parent_id ?? null,
  expected: rows.map(({ id, updated_at }) => ({ id, updated_at })),
  ordered_ids: rows.map((row) => row.id).reverse(),
});
const reorder = (rows: EditorCategory[]) =>
  request({
    method: "PUT",
    url: "/editor/categories/order",
    payload: orderBody(rows),
  });
async function rows(): Promise<EditorCategory[]> {
  return EditorCategory.array().parse(
    (await request({ url: "/editor/categories" })).json().categories,
  );
}
const page = (url: string, category_id: string | null = null) =>
  request({
    method: "POST",
    url: "/pages",
    payload: { url, category_id, title: "Service", body_markdown: "Body" },
  });

// Queue both real HTTP transactions behind a third connection. Observe each
// waiter before launching the next so both operations overlap in a known order.
async function race<T, U>(
  first: () => PromiseLike<T>,
  second: () => PromiseLike<U>,
): Promise<[T, U]> {
  const gate = await test.pool.connect();
  const pending: Promise<T | U>[] = [];
  try {
    await gate.query("begin");
    await gate.query(
      "select pg_advisory_xact_lock(hashtext('content_pages.parent_id'))",
    );
    const waitFor = async (count: number) => {
      await expect
        .poll(
          async () => {
            const locks = await test.pool.query<{
              count: number;
            }>(`select count(*)::int as count from pg_locks
          where locktype = 'advisory' and not granted
            and database = (select oid from pg_database where datname = current_database())`);
            return locks.rows[0]?.count;
          },
          { timeout: 5000, interval: 10 },
        )
        .toBe(count);
    };
    const a = Promise.resolve(first());
    pending.push(a);
    await waitFor(1);
    const b = Promise.resolve(second());
    pending.push(b);
    await waitFor(2);
    // No queued writer may already own page/category row locks.
    await gate.query("select id from categories for update nowait");
    await gate.query("select id from content_pages for update nowait");
    await gate.query("commit");
    return await Promise.all([a, b]);
  } finally {
    await gate.query("rollback");
    gate.release();
    await Promise.allSettled(pending);
  }
}

describe("serialized category and page writes", () => {
  it.each([false, true])(
    "appends independently into an empty group (subcategories=%s)",
    async (subcategories) => {
      const parent = subcategories ? await create("parent") : null;
      const [a, b] = await race(
        () => post("a", parent?.id),
        () => post("b", parent?.id),
      );
      expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
      expect([a.json().position, b.json().position]).toEqual([0, 1]);
      expect(
        (await rows())
          .filter((row) => row.parent_id === (parent?.id ?? null))
          .map((row) => row.slug),
      ).toEqual(["a", "b"]);
    },
  );

  it("preserves an unrelated sibling edit while appending", async () => {
    const existing = await create("existing");
    const [edit, add] = await race(
      () => save(existing, { title: "Renamed" }),
      () => post("new"),
    );
    expect([edit.statusCode, add.statusCode]).toEqual([200, 201]);
    expect((await rows()).map((row) => row.title)).toEqual(["Renamed", "new"]);
  });

  it("appends independent reparentings and preserves a destination sibling edit", async () => {
    const parent = await create("parent");
    const a = await create("a");
    const b = await create("b");
    const c = await create("c");
    const [first, second] = await race(
      () => save(a, { parent_id: parent.id }),
      () => save(b, { parent_id: parent.id }),
    );
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    expect([first.json().position, second.json().position]).toEqual([0, 1]);
    const [edit, move] = await race(
      () => save(EditorCategory.parse(first.json()), { title: "Preserved" }),
      () => save(c, { parent_id: parent.id }),
    );
    expect([edit.statusCode, move.statusCode]).toEqual([200, 200]);
    expect(move.json().position).toBe(2);
    expect((await rows()).find((row) => row.id === a.id)?.title).toBe(
      "Preserved",
    );
  });

  it("does not overwrite a concurrent save or delete", async () => {
    const existing = await create("existing");
    const [edit, stale] = await race(
      () => save(existing, { title: "Winner" }),
      () => save(existing, { title: "Loser" }),
    );
    expect([edit.statusCode, stale.statusCode]).toEqual([200, 409]);
    expect((await rows())[0]?.title).toBe("Winner");
    const current = EditorCategory.parse(edit.json());
    const [deleted, gone] = await race(
      () => remove(current),
      () => remove(current),
    );
    expect([deleted.statusCode, gone.statusCode]).toEqual([204, 404]);
  });

  it("rejects a competing duplicate slug without leaking storage errors", async () => {
    const [a, b] = await race(
      () => post("same"),
      () => post("same"),
    );
    expect([a.statusCode, b.statusCode]).toEqual([201, 422]);
    expect(await rows()).toHaveLength(1);
  });

  it.each(["title", "slug"] as const)(
    "uses the current parent after a concurrent %s edit",
    async (field) => {
      const parent = await create("parent");
      const [edit, child] = await race(
        () => save(parent, { [field]: "renamed" }),
        () => post("child", parent.id),
      );
      expect([edit.statusCode, child.statusCode]).toEqual([200, 201]);
      expect(child.json().url).toBe(
        field === "slug" ? "/renamed/child" : "/parent/child",
      );
      expect((await rows()).find((row) => row.id === parent.id)?.[field]).toBe(
        "renamed",
      );
    },
  );

  it("refuses parent address changes when child creation wins", async () => {
    const parent = await create("parent");
    const [child, move] = await race(
      () => post("child", parent.id),
      () => save(parent, { slug: "moved" }),
    );
    expect([child.statusCode, move.statusCode]).toEqual([201, 422]);
    expect((await rows())[0]?.slug).toBe("parent");
  });

  it.each(["delete", "reparent"] as const)(
    "revalidates the parent after concurrent %s",
    async (action) => {
      const parent = await create("parent");
      const destination = await create("destination");
      const [moved, child] = await race(
        () =>
          action === "delete"
            ? remove(parent)
            : save(parent, { parent_id: destination.id }),
        () => post("child", parent.id),
      );
      expect(moved.statusCode).toBe(action === "delete" ? 204 : 200);
      expect(child.statusCode).toBe(422);
      expect((await rows()).some((row) => row.slug === "child")).toBe(false);
    },
  );

  it("cannot create a cycle by concurrently reparenting roots beneath each other", async () => {
    const a = await create("a");
    const b = await create("b");
    const [first, second] = await race(
      () => save(a, { parent_id: b.id }),
      () => save(b, { parent_id: a.id }),
    );
    expect([first.statusCode, second.statusCode]).toEqual([200, 422]);
    expect((await rows()).map((row) => [row.id, row.parent_id])).toEqual([
      [b.id, null],
      [a.id, b.id],
    ]);
  });

  it.each(["insert", "edit", "delete", "reparent"] as const)(
    "refuses a reorder after concurrent sibling %s",
    async (action) => {
      const parent = await create("parent");
      const a = await create("a", parent.id);
      const b = await create("b", parent.id);
      const [change, stale] = await race(
        () => {
          if (action === "insert") return post("c", parent.id);
          if (action === "edit") return save(a, { title: "Edited" });
          if (action === "delete") return remove(a);
          return save(a, { parent_id: null });
        },
        () => reorder([a, b]),
      );
      expect(change.statusCode).toBeLessThan(300);
      expect(stale.statusCode).toBe(409);
      expect((await rows()).find((row) => row.id === b.id)?.position).toBe(1);
    },
  );

  it("appends after a winning reorder and refuses a stale second reorder", async () => {
    const a = await create("a");
    const b = await create("b");
    const [ordered, appended] = await race(
      () => reorder([a, b]),
      () => post("c"),
    );
    expect([ordered.statusCode, appended.statusCode]).toEqual([200, 201]);
    expect((await rows()).map((row) => row.slug)).toEqual(["b", "a", "c"]);
    const snapshot = await rows();
    const [first, stale] = await race(
      () => reorder(snapshot),
      () => reorder(snapshot),
    );
    expect([first.statusCode, stale.statusCode]).toEqual([200, 409]);
  });

  it.each(["create", "save"] as const)(
    "blocks deletion when page %s assigns the category first",
    async (action) => {
      const category = await create("category");
      const existing = (await page("/existing")).json();
      if (action === "save") {
        const child = await request({
          method: "POST",
          url: "/pages",
          payload: {
            url: "/existing/support",
            parent_id: existing.id,
            title: "Supporting",
            body_markdown: "Body",
          },
        });
        expect(child.statusCode).toBe(201);
      }
      const assign = () =>
        action === "create"
          ? page("/new", category.id)
          : request({
              method: "PUT",
              url: `/pages/${existing.id}`,
              payload: { ...existing, category_id: category.id },
            });
      const [assigned, blocked] = await race(assign, () => remove(category));
      expect(assigned.statusCode).toBe(action === "create" ? 201 : 200);
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json()).toMatchObject({
        error: "category_in_use",
        blockers: { pages: action === "save" ? 2 : 1 },
      });
    },
  );

  it("refuses page assignment when category deletion wins", async () => {
    const category = await create("category");
    const [deleted, refused] = await race(
      () => remove(category),
      () => page("/new", category.id),
    );
    expect([deleted.statusCode, refused.statusCode]).toEqual([204, 422]);
    // The category's create and delete; the refused page left nothing.
    expect((await request({ url: "/version" })).json()).toEqual({
      count: 2,
      latest: expect.any(String),
    });
  });

  it("rechecks occupancy before changing a category address", async () => {
    const category = await create("category");
    const [assigned, blocked] = await race(
      () => page("/new", category.id),
      () => save(category, { slug: "moved" }),
    );
    expect([assigned.statusCode, blocked.statusCode]).toEqual([201, 422]);
  });

  it("allows empty-category deletion after the occupying page is deleted", async () => {
    const category = await create("category");
    const occupying = (await page("/occupying", category.id)).json();
    const [deletedPage, deletedCategory] = await race(
      () => request({ method: "DELETE", url: `/pages/${occupying.id}` }),
      () => remove(category),
    );
    expect([deletedPage.statusCode, deletedCategory.statusCode]).toEqual([
      204, 204,
    ]);
  });

  it.each([true, false])(
    "serializes category versus page URL creation (category first=%s)",
    async (categoryFirst) => {
      const [first, second] = await race(
        () => (categoryFirst ? post("claimed") : page("/claimed")),
        () => (categoryFirst ? page("/claimed") : post("claimed")),
      );
      expect([first.statusCode, second.statusCode]).toEqual([201, 422]);
    },
  );

  it.each([true, false])(
    "serializes category versus page URL changes (category first=%s)",
    async (categoryFirst) => {
      const category = await create("old");
      const existing = (await page("/page")).json();
      const moveCategory = () => save(category, { slug: "claimed" });
      const movePage = () =>
        request({
          method: "PUT",
          url: `/pages/${existing.id}`,
          payload: { ...existing, url: "/claimed" },
        });
      const [first, second] = await race(
        categoryFirst ? moveCategory : movePage,
        categoryFirst ? movePage : moveCategory,
      );
      expect([first.statusCode, second.statusCode]).toEqual([200, 422]);
    },
  );

  it("rolls back earlier order updates and stamps if a later write fails", async () => {
    const a = await create("a");
    const b = await create("b");
    await test.pool.query(
      "alter table categories add constraint test_reorder_failure check (slug <> 'a' or position <> 1)",
    );
    const response = await reorder([a, b]);
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error" });
    expect(await rows()).toEqual([a, b]);
  });

  it("persists strictly increasing stamps with a frozen clock and compares timezone-equivalent versions", async () => {
    const editing = new CategoryEditing(
      new PostgresPages(test.db),
      () => new Date("2026-10-26T12:00:00.000Z"),
    );
    let category = expectOk(
      await editing.create(fields("frozen"), TEST_EMPLOYEE),
    );
    for (let n = 0; n < 5; n++) {
      const previous = category.updated_at;
      category = expectOk(
        // A real change each time: a save that changes nothing keeps its stamp.
        await editing.update(
          category.id,
          { ...fields("frozen"), title: `Frozen ${n}` },
          previous,
          TEST_EMPLOYEE,
        ),
      );
      expect(Date.parse(category.updated_at) - Date.parse(previous)).toBe(1);
    }
    const equivalent = CategoryStamp.parse(
      category.updated_at.replace("12:00", "13:00").replace("Z", "+01:00"),
    );
    expect(
      (
        await editing.update(
          category.id,
          { ...fields("frozen"), title: "Frozen again" },
          equivalent,
          TEST_EMPLOYEE,
        )
      ).ok,
    ).toBe(true);
    expect((await rows())[0]?.updated_at).toBe("2026-10-26T12:00:00.006Z");
  });
});
