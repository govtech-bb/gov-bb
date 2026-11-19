import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fieldsOf, type EditorPage, type PageFields } from "./modules/page";
import { pageRedirects } from "./schema";
import {
  aPage,
  createTestApp,
  createTestDb,
  createTestServices,
  expectOk,
  SELF_APPROVAL,
  TEST_EMPLOYEE,
  TEST_HEADERS,
  type TestDb,
} from "./test-db";

let test: TestDb;
let app: FastifyInstance;
let services: ReturnType<typeof createTestServices>;
beforeEach(async () => {
  test = await createTestDb();
  app = await createTestApp(test.db, SELF_APPROVAL);
  services = createTestServices(test.db, SELF_APPROVAL);
});
afterEach(async () => {
  await app.close();
  await test.close();
});
const request = (options: InjectOptions) =>
  app.inject({ ...options, headers: { ...TEST_HEADERS, ...options.headers } });
const read = (url: string) =>
  request({ url: `/pages?url=${encodeURIComponent(url)}` });
const create = async (url: string) =>
  expectOk(await services.editing.create(aPage({ url }), TEST_EMPLOYEE));
const post = (url: string, visibility: PageFields["visibility"] = "public") =>
  request({
    method: "POST",
    url: "/pages",
    payload: aPage({ url, visibility }),
  });
const save = (page: EditorPage, fields: Partial<PageFields>) =>
  request({
    method: "PUT",
    url: `/pages/${page.id}`,
    payload: { ...fieldsOf(page), ...fields, expected_version: page.version },
  });
const publish = (page: Pick<EditorPage, "id" | "version">) =>
  request({
    method: "POST",
    url: `/pages/${page.id}/revision/publish`,
    payload: { expected_version: page.version },
  });
const remove = (page: EditorPage) =>
  request({
    method: "DELETE",
    url: `/pages/${page.id}?expected_version=${page.version}`,
  });
const rules = () =>
  test.db
    .select({
      source: pageRedirects.sourceUrl,
      destination: pageRedirects.destinationUrl,
    })
    .from(pageRedirects)
    .orderBy(pageRedirects.sourceUrl);
async function pendingMove(page: EditorPage, url: string) {
  const pending = expectOk(
    await services.editing.save(
      page.id,
      { ...fieldsOf(page), url },
      page.version,
      TEST_EMPLOYEE,
    ),
  );
  const submitted = expectOk(
    await services.editing.submit(page.id, pending.version, TEST_EMPLOYEE),
  );
  return { id: page.id, version: submitted.version };
}

// Observe each writer waiting on the content lock before queuing the next; timing alone cannot order the race.
async function racePageWrites<T, U>(
  first: () => PromiseLike<T>,
  second: () => PromiseLike<U>,
): Promise<[T, U]> {
  const gate = await test.pool.connect();
  const pending: Promise<unknown>[] = [];
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
    await gate.query("select id from content_pages for update nowait");
    await gate.query("select id from page_redirects for update nowait");
    await gate.query("commit");
    return await Promise.all([a, b]);
  } finally {
    await gate.query("rollback");
    gate.release();
    await Promise.allSettled(pending);
  }
}

describe("serialized page redirect writes", () => {
  it("allows one publication to a shared destination and rejects the other with the URL 422", async () => {
    const a = await pendingMove(await create("/a"), "/destination");
    const b = await pendingMove(await create("/b"), "/destination");
    const [winner, refused] = await racePageWrites(
      () => publish(a),
      () => publish(b),
    );
    expect([winner.statusCode, refused.statusCode]).toEqual([200, 422]);
    expect(refused.json()).toMatchObject({ errors: [{ field: "url" }] });
    expect((await read("/a")).headers.location).toBe("/destination");
    expect((await read("/b")).statusCode).toBe(200);
    expect(await rules()).toEqual([
      { source: "/a", destination: "/destination" },
    ]);
    expect(expectOk(await services.editing.open(b.id))).toMatchObject({
      pending_revision: { status: "submitted" },
      url: "/destination",
    });
  });

  it("returns 409 to a second publication using the stale page version", async () => {
    const page = await pendingMove(await create("/a"), "/b");
    const [winner, stale] = await racePageWrites(
      () => publish(page),
      () => publish(page),
    );
    expect([winner.statusCode, stale.statusCode]).toEqual([200, 409]);
    expect(await rules()).toEqual([{ source: "/a", destination: "/b" }]);
    expect((await read("/a")).headers.location).toBe("/b");
  });

  it.each([
    [true, "draft"],
    [true, "preview"],
    [true, "public"],
    [false, "draft"],
    [false, "preview"],
    [false, "public"],
  ] as const)(
    "serializes source reuse against a move (moveFirst=%s, visibility=%s)",
    async (moveFirst, visibility) => {
      const page = await pendingMove(await create("/a"), "/b");
      const move = () => publish(page);
      const reuse = () => post("/a", visibility);
      const [first, second] = await racePageWrites(
        moveFirst ? move : reuse,
        moveFirst ? reuse : move,
      );
      expect([first.statusCode, second.statusCode]).toEqual(
        moveFirst ? [200, 201] : [422, 200],
      );
      const replaced = moveFirst && visibility === "public";
      expect(await rules()).toEqual(
        replaced ? [] : [{ source: "/a", destination: "/b" }],
      );
      expect((await read("/a")).statusCode).toBe(replaced ? 200 : 301);
      expect((await read("/b")).statusCode).toBe(200);
    },
  );

  it.each([
    [true, "draft"],
    [true, "public"],
    [false, "draft"],
    [false, "public"],
  ] as const)(
    "serializes republication against former-source reuse (publishFirst=%s, visibility=%s)",
    async (publishFirst, visibility) => {
      const pending = await pendingMove(await create("/origin"), "/a");
      let page = expectOk(
        await services.editing.publish(
          pending.id,
          pending.version,
          TEST_EMPLOYEE,
        ),
      );
      page = expectOk(
        await services.editing.save(
          page.id,
          { ...fieldsOf(page), visibility: "draft" },
          page.version,
          TEST_EMPLOYEE,
        ),
      );
      page = expectOk(
        await services.editing.save(
          page.id,
          { ...fieldsOf(page), url: "/b" },
          page.version,
          TEST_EMPLOYEE,
        ),
      );
      const republish = () => save(page, { visibility: "public" });
      const reuse = () => post("/a", visibility);
      const [first, second] = await racePageWrites(
        publishFirst ? republish : reuse,
        publishFirst ? reuse : republish,
      );
      expect([first.statusCode, second.statusCode]).toEqual(
        publishFirst ? [200, 201] : [201, 200],
      );
      expect(await rules()).toEqual([
        ...(publishFirst && visibility === "draft"
          ? [{ source: "/a", destination: "/b" }]
          : []),
        { source: "/origin", destination: publishFirst ? "/b" : "/a" },
      ]);
      expect((await read("/b")).statusCode).toBe(200);
      expect((await read("/a")).statusCode).toBe(
        visibility === "public" ? 200 : publishFirst ? 301 : 404,
      );
    },
  );

  it.each([true, false])(
    "preserves the rule while deleting and recreating its destination (deleteFirst=%s)",
    async (deleteFirst) => {
      const pending = await pendingMove(await create("/a"), "/b");
      const page = expectOk(
        await services.editing.publish(
          pending.id,
          pending.version,
          TEST_EMPLOYEE,
        ),
      );
      const deletion = () => remove(page);
      const recreation = () => post("/b");
      const [first, second] = await racePageWrites(
        deleteFirst ? deletion : recreation,
        deleteFirst ? recreation : deletion,
      );
      expect([first.statusCode, second.statusCode]).toEqual(
        deleteFirst ? [204, 201] : [422, 204],
      );
      if (deleteFirst) expect(second.json().id).not.toBe(page.id);
      expect(await rules()).toEqual([{ source: "/a", destination: "/b" }]);
      expect((await read("/a")).headers.location).toBe("/b");
      expect((await read("/b")).statusCode).toBe(deleteFirst ? 200 : 404);
    },
  );

  it("does not allow swapping two occupied page URLs", async () => {
    const a = await create("/a");
    const b = await create("/b");
    const [first, second] = await racePageWrites(
      () => save(a, { url: "/b" }),
      () => save(b, { url: "/a" }),
    );
    expect([first.statusCode, second.statusCode]).toEqual([422, 422]);
    expect(await rules()).toEqual([]);
    for (const url of ["/a", "/b"])
      expect((await read(url)).statusCode).toBe(200);
  });

  it("exposes the old page until a move and its redirect commit together", async () => {
    const page = await create("/a");
    const writer = await test.pool.connect();
    try {
      await writer.query("begin");
      await writer.query(
        "select pg_advisory_xact_lock(hashtext('content_pages.parent_id'))",
      );
      await writer.query("update content_pages set url = '/b' where id = $1", [
        page.id,
      ]);
      expect((await read("/a")).statusCode).toBe(200);
      expect((await read("/b")).statusCode).toBe(404);
      await writer.query(
        "insert into page_redirects(source_url, destination_url) values ('/a', '/b')",
      );
      expect((await read("/a")).statusCode).toBe(200);
      await writer.query("commit");
      const redirect = await read("/a");
      expect(redirect.statusCode).toBe(301);
      expect(redirect.headers.location).toBe("/b");
      expect((await read("/b")).statusCode).toBe(200);
    } finally {
      await writer.query("rollback");
      writer.release();
    }
  });
});
