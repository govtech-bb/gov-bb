/**
 * "When migrations are pushed, then the resulting tables match the schema
 * column for column" — #2700.
 *
 * The DDL and the Drizzle definition are two spellings of one schema, and
 * nothing in TypeScript connects them: add a column to `schema.ts` and forget
 * the migration and every query still compiles, then fails at runtime with a
 * 42703 that names a column the code is certain exists. So the migration runs
 * against a real Postgres and the result is compared to the Drizzle tables by
 * reading `information_schema`, rather than by reading both files carefully.
 */

import { getTableColumns } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  categories,
  changeEvents,
  contentPages,
  pageDrafts,
  pageLocks,
  searchChunks,
} from "./schema";
import { createTestDb } from "./test-db";
import type { Database } from "./db";

type InformationSchemaColumn = {
  table_name: string;
  column_name: string;
  is_nullable: "YES" | "NO";
  data_type: string;
  datetime_precision: number | null;
};

const rowsOf = async (db: Database) => {
  const { rows } = await db.execute<InformationSchemaColumn>(
    sql`select table_name, column_name, is_nullable, data_type, datetime_precision
         from information_schema.columns
         where table_schema = 'public'
         order by table_name, column_name`,
  );
  return rows;
};

const TABLES = {
  categories,
  content_pages: contentPages,
  change_events: changeEvents,
  page_drafts: pageDrafts,
  page_locks: pageLocks,
  search_chunks: searchChunks,
};

describe("the Drizzle schema and the migration", () => {
  it("agree on every column of every table, and on which are nullable", async () => {
    const { db, close } = await createTestDb();
    const actual = await rowsOf(db);

    for (const [table, definition] of Object.entries(TABLES)) {
      const inDatabase = actual
        .filter((row) => row.table_name === table)
        .map(
          (row) => `${row.column_name}${row.is_nullable === "YES" ? "?" : ""}`,
        );

      const inDrizzle = Object.values(getTableColumns(definition))
        .map((column) => `${column.name}${column.notNull ? "" : "?"}`)
        .sort();

      expect({ [table]: inDatabase }).toEqual({ [table]: inDrizzle });
    }

    await close();
  });

  it("stores timestamps to milliseconds, which is all the wire format carries", async () => {
    // `toISOString()` emits milliseconds and Postgres stores microseconds, so
    // a bare `timestamptz` makes every optimistic-concurrency check compare
    // .914Z against .914123 and fail. The suite once ran on PGlite, which
    // rounds to milliseconds and hid this — hence an assertion on the
    // declared precision rather than on a round trip.
    const { db, close } = await createTestDb();
    const timestamps = (await rowsOf(db)).filter(
      (row) =>
        row.data_type === "timestamp with time zone" &&
        // `schema_migrations` is the runner's own bookkeeping and never
        // crosses the wire, so its precision does not matter.
        row.table_name in TABLES,
    );

    expect(timestamps.length).toBeGreaterThan(0);
    for (const column of timestamps) {
      expect({
        column: `${column.table_name}.${column.column_name}`,
        precision: column.datetime_precision,
      }).toEqual({
        column: `${column.table_name}.${column.column_name}`,
        precision: 3,
      });
    }

    await close();
  });

  it("stores the markdown as text, and nothing compiled from it", async () => {
    const { db, close } = await createTestDb();
    const columns = (await rowsOf(db)).filter(
      (row) => row.table_name === "content_pages",
    );
    const typeOf = (name: string) =>
      columns.find((row) => row.column_name === name)?.data_type;

    expect(typeOf("body_markdown")).toBe("text");
    expect(typeOf("hast")).toBeUndefined();
    expect(typeOf("frontmatter")).toBe("jsonb");

    await close();
  });

  it("takes a form id as a name, since form status lives in the forms API", async () => {
    const { db, close } = await createTestDb();

    await db.execute(
      sql`insert into content_pages (url, slug, title, form_id, body_markdown)
          values ('/x', 'x', 'X', 'any-form', '')`,
    );

    await close();
  });

  it("will not delete a category while a page is filed under it", async () => {
    const { db, close } = await createTestDb();
    await db.execute(
      sql`insert into categories (id, slug, title)
          values ('33333333-3333-4333-8333-333333333333', 'c', 'C')`,
    );
    await db.execute(
      sql`insert into content_pages (url, slug, title, category_id, body_markdown)
          values ('/c/x', 'x', 'X', '33333333-3333-4333-8333-333333333333', '')`,
    );

    const refused = await db
      .execute(sql`delete from categories where slug = 'c'`)
      .then(
        () => null,
        (error: Error) => error,
      );

    expect(refused).toBeInstanceOf(Error);

    await close();
  });
});

const CATEGORY_A = "33333333-3333-4333-8333-333333333333";
const CATEGORY_B = "44444444-4444-4444-8444-444444444444";
const PARENT = "55555555-5555-4555-8555-555555555555";

/** Two categories and a page in the first, for the hierarchy tests. */
async function withParent(db: Database) {
  await db.execute(
    sql`insert into categories (id, slug, title)
        values (${CATEGORY_A}, 'a', 'A'), (${CATEGORY_B}, 'b', 'B')`,
  );
  await db.execute(
    sql`insert into content_pages (id, url, slug, title, category_id, body_markdown)
        values (${PARENT}, '/a/parent', 'parent', 'Parent', ${CATEGORY_A}, '')`,
  );
}

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: Error) => String(error.cause),
  );

describe("the page hierarchy", () => {
  it("keeps a sub-page in its parent's category", async () => {
    const { db, close } = await createTestDb();
    await withParent(db);

    const refused = await refusal(
      db.execute(
        sql`insert into content_pages (url, slug, title, category_id, parent_id, body_markdown)
            values ('/b/child', 'child', 'Child', ${CATEGORY_B}, ${PARENT}, '')`,
      ),
    );

    expect(refused).toMatch(/content_pages_parent_category_fkey/);
    await close();
  });

  it("moves sub-pages with their parent when its category changes", async () => {
    const { db, close } = await createTestDb();
    await withParent(db);
    await db.execute(
      sql`insert into content_pages (url, slug, title, category_id, parent_id, body_markdown)
          values ('/a/parent/start', 'start', 'Start', ${CATEGORY_A}, ${PARENT}, '')`,
    );

    await db.execute(
      sql`update content_pages set category_id = ${CATEGORY_B} where id = ${PARENT}`,
    );

    const { rows } = await db.execute<{ category_id: string }>(
      sql`select category_id from content_pages where slug = 'start'`,
    );
    expect(rows).toEqual([{ category_id: CATEGORY_B }]);
    await close();
  });

  it("checks the parent exists for an uncategorised page too", async () => {
    // The composite key is skipped when category_id is null; the plain key
    // on parent_id is what refuses this.
    const { db, close } = await createTestDb();

    const refused = await refusal(
      db.execute(
        sql`insert into content_pages (url, slug, title, parent_id, body_markdown)
            values ('/x', 'x', 'X', ${PARENT}, '')`,
      ),
    );

    expect(refused).toMatch(/content_pages_parent_id_fkey/);
    await close();
  });

  it("will not delete a page that still has sub-pages", async () => {
    const { db, close } = await createTestDb();
    await withParent(db);
    await db.execute(
      sql`insert into content_pages (url, slug, title, category_id, parent_id, body_markdown)
          values ('/a/parent/start', 'start', 'Start', ${CATEGORY_A}, ${PARENT}, '')`,
    );

    const refused = await refusal(
      db.execute(sql`delete from content_pages where id = ${PARENT}`),
    );

    expect(refused).toMatch(/foreign key/);
    await close();
  });
});

describe("search chunks", () => {
  it("generates the tsvector from the heading and body, and go with their page", async () => {
    const { db, close } = await createTestDb();
    await withParent(db);
    await db.execute(
      sql`insert into search_chunks (page_id, ordinal, heading, body)
          values (${PARENT}, 0, 'Fees', 'A licence costs fifty dollars')`,
    );

    const { rows } = await db.execute<{ hit: boolean }>(
      sql`select tsv @@ to_tsquery('english', 'licences & fee') as hit
          from search_chunks`,
    );
    expect(rows).toEqual([{ hit: true }]);

    await db.execute(sql`delete from content_pages where id = ${PARENT}`);
    const left = await db.execute(sql`select 1 from search_chunks`);
    expect(left.rows).toEqual([]);
    await close();
  });
});
