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
  changeEvents,
  collectionRecords,
  contentPages,
  dataCollections,
} from "./schema";
import { createTestDb } from "./test-db";
import type { Database } from "./store";

type InformationSchemaColumn = {
  table_name: string;
  column_name: string;
  is_nullable: "YES" | "NO";
  data_type: string;
  datetime_precision: number | null;
};

const rowsOf = async (db: Database) => {
  const result = (await db.execute(
    sql`select table_name, column_name, is_nullable, data_type, datetime_precision
         from information_schema.columns
         where table_schema = 'public'
         order by table_name, column_name`,
  )) as { rows?: InformationSchemaColumn[] } | InformationSchemaColumn[];
  return Array.isArray(result) ? result : (result.rows ?? []);
};

const TABLES = {
  content_pages: contentPages,
  data_collections: dataCollections,
  collection_records: collectionRecords,
  change_events: changeEvents,
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
    // .914Z against .914123 and fail. PGlite rounds to milliseconds, so the
    // whole suite passed and only a real Postgres showed it — hence an
    // assertion on the declared precision rather than on a round trip.
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

  it("keeps the page body as jsonb, not a markdown string", async () => {
    const { db, close } = await createTestDb();
    const body = (await rowsOf(db)).find(
      (row) => row.table_name === "content_pages" && row.column_name === "body",
    );

    expect(body?.data_type).toBe("jsonb");

    await close();
  });

  it("refuses a body that is not a block document", async () => {
    // The `content_pages_body_shape` check is what stops a markdown string,
    // or a half-migrated row, being written where `{version, blocks, refs}`
    // belongs.
    const { db, close } = await createTestDb();

    const refused = await db
      .execute(
        sql`insert into content_pages (url, slug, schema_name, document_type, title, body)
            values ('/x', 'x', 'answer', 'answer', 'X', '"# A markdown page"'::jsonb)`,
      )
      .then(
        () => null,
        (error: Error) => error,
      );

    expect(refused).toBeInstanceOf(Error);

    await close();
  });
});
