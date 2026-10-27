/**
 * The history the database writes itself (#3169): every change to a content
 * table becomes a `change_events` row, attributed to the transaction's
 * `app.user_id` or to `system`.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { PostgresPages } from "./adapters/postgres-pages";
import type { Database } from "./db";
import { creationOf, withDefaults } from "./modules/page";
import { seed } from "./seed";
import {
  aPage,
  createTestDb,
  createTestServices,
  expectOk,
  TEST_EMPLOYEE,
  TEST_SERVER,
} from "./test-db";

const CATEGORY_A = "33333333-3333-4333-8333-333333333333";
const CATEGORY_B = "44444444-4444-4444-8444-444444444444";
const PAGE = "55555555-5555-4555-8555-555555555555";

/** One entity's history, oldest first. */
const historyOf = async (db: Database, entityId: string) =>
  (
    await db.execute<{ action: string; actor: string }>(
      sql`select action, actor from change_events
            where entity_id = ${entityId} order by version_no`,
    )
  ).rows;

const versionOf = async (db: Database) =>
  expectOk(await createTestServices(db).index.version()).count;

const newPage = () => creationOf(undefined, withDefaults(aPage()), new Date());

describe("the change history trigger", () => {
  it("names what happened to a page, as system when no user is set", async () => {
    const { db, close } = await createTestDb();
    const run = (statement: ReturnType<typeof sql>) => db.execute(statement);

    await run(
      sql`insert into content_pages (id, url, slug, title, body_markdown)
          values (${PAGE}, '/x', 'x', 'X', '')`,
    );
    await run(sql`update content_pages set title = 'Y' where id = ${PAGE}`);
    await run(
      sql`update content_pages set visibility = 'public', published_at = now()
          where id = ${PAGE}`,
    );
    await run(
      sql`update content_pages set visibility = 'draft' where id = ${PAGE}`,
    );
    await run(
      sql`update content_pages set visibility = 'public' where id = ${PAGE}`,
    );
    // Nothing but the timestamp: not a change worth a version.
    await run(
      sql`update content_pages set updated_at = updated_at + interval '1 second'
          where id = ${PAGE}`,
    );
    await run(sql`delete from content_pages where id = ${PAGE}`);

    expect(await historyOf(db, PAGE)).toEqual(
      [
        "created",
        "updated",
        "published",
        "unpublished",
        "published",
        "deleted",
      ].map((action) => ({ action, actor: "system" })),
    );
    await close();
  });

  it("snapshots the row as stored, and the row as it stood on delete", async () => {
    const { db, close } = await createTestDb();
    await db.execute(
      sql`insert into content_pages (id, url, slug, title, body_markdown)
          values (${PAGE}, '/x', 'x', 'X', '')`,
    );
    await db.execute(sql`delete from content_pages where id = ${PAGE}`);

    const { rows } = await db.execute<{
      snapshot: { id: string; url: string };
    }>(sql`select snapshot from change_events where entity_id = ${PAGE}`);
    expect(rows.map((row) => [row.snapshot.id, row.snapshot.url])).toEqual([
      [PAGE, "/x"],
      [PAGE, "/x"],
    ]);
    await close();
  });

  it("records a category change, which moves the version", async () => {
    const { db, close } = await createTestDb();
    await db.execute(
      sql`insert into categories (id, slug, title) values (${CATEGORY_A}, 'a', 'A')`,
    );
    const before = await versionOf(db);

    await db.execute(
      sql`update categories set title = 'Renamed' where id = ${CATEGORY_A}`,
    );

    expect(await versionOf(db)).toBe(before + 1);
    const { rows } = await db.execute<{ entity_kind: string; action: string }>(
      sql`select entity_kind, action from change_events
            where entity_id = ${CATEGORY_A} order by version_no`,
    );
    expect(rows).toEqual([
      { entity_kind: "category", action: "created" },
      { entity_kind: "category", action: "updated" },
    ]);
    await close();
  });

  it("refuses a write by a user who is not in auth_user", async () => {
    const { db, close } = await createTestDb();

    const outcome = await new PostgresPages(db).atomically(
      "nobody",
      (records) => records.insert(newPage()),
    );

    expect(outcome.ok).toBe(false);
    const { rows } = await db.execute(sql`select 1 from content_pages`);
    expect(rows).toEqual([]);
    await close();
  });

  it("forgets the user when their transaction ends, on the same connection", async () => {
    const { name, close } = await createTestDb();
    const pool = new Pool({ ...TEST_SERVER, database: name, max: 1 });
    const db = drizzle(pool);
    try {
      const created = expectOk(
        await new PostgresPages(db).atomically(TEST_EMPLOYEE.id, (records) =>
          records.insert(newPage()),
        ),
      );
      await db.execute(
        sql`update content_pages set title = 'By a script' where id = ${created.id}`,
      );

      expect(await historyOf(db, created.id)).toEqual([
        { action: "created", actor: TEST_EMPLOYEE.id },
        { action: "updated", actor: "system" },
      ]);
    } finally {
      await pool.end();
      await close();
    }
  });

  it("records one event when the same content is saved twice", async () => {
    const { db, close } = await createTestDb();
    const { editing } = createTestServices(db);
    const page = expectOk(await editing.create(aPage(), TEST_EMPLOYEE));
    const fields = { ...withDefaults(aPage()), title: "Renamed" };

    expectOk(await editing.save(page.id, fields, null, TEST_EMPLOYEE));
    expectOk(await editing.save(page.id, fields, null, TEST_EMPLOYEE));

    expect(await historyOf(db, page.id)).toEqual([
      { action: "created", actor: TEST_EMPLOYEE.id },
      { action: "updated", actor: TEST_EMPLOYEE.id },
    ]);
    await close();
  });

  it("records each sub-page a parent's move carries, and moves its updated_at", async () => {
    const { db, close } = await createTestDb();
    const { editing } = createTestServices(db);
    await db.execute(
      sql`insert into categories (id, slug, title)
          values (${CATEGORY_A}, 'a', 'A'), (${CATEGORY_B}, 'b', 'B')`,
    );
    const parent = expectOk(
      await editing.create(
        aPage({ url: "/a/parent", category_id: CATEGORY_A }),
        TEST_EMPLOYEE,
      ),
    );
    const child = expectOk(
      await editing.create(
        aPage({ url: "/a/parent/start", parent_id: parent.id }),
        TEST_EMPLOYEE,
      ),
    );
    const before = await versionOf(db);

    expectOk(
      await editing.save(
        parent.id,
        { ...parent, category_id: CATEGORY_B },
        null,
        TEST_EMPLOYEE,
      ),
    );

    const moved = expectOk(await editing.get(child.id));
    expect(moved?.category_id).toBe(CATEGORY_B);
    expect(moved?.updated_at).not.toBe(child.updated_at);
    expect(await historyOf(db, child.id)).toEqual([
      { action: "created", actor: TEST_EMPLOYEE.id },
      { action: "updated", actor: TEST_EMPLOYEE.id },
    ]);
    expect(await versionOf(db)).toBe(before + 2);
    await close();
  });

  it("moves the version after a seed and a delete", async () => {
    const { db, close } = await createTestDb();
    const { editing } = createTestServices(db);

    await seed(db);
    const seeded = await versionOf(db);
    expect(seeded).toBeGreaterThan(0);

    const page = expectOk(
      await editing.create(aPage({ url: "/new" }), TEST_EMPLOYEE),
    );
    expectOk(await editing.delete(page.id, TEST_EMPLOYEE));

    expect(await versionOf(db)).toBe(seeded + 2);
    await close();
  });
});
