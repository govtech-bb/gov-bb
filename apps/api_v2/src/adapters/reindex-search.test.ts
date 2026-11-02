import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { creationOf, withDefaults } from "../modules/page";
import { changeEvents, contentPages, searchChunks } from "../schema";
import { aPage, createTestDb, expectOk } from "../test-db";
import { PostgresPages, writeSearchChunks } from "./postgres-pages";
import { reindexSearchChunks } from "./reindex-search";

describe("reindexSearchChunks", () => {
  it("checks without writing, then replaces only the search projection on explicit apply", async () => {
    const { db, close } = await createTestDb();
    try {
      const records = new PostgresPages(db);
      const page = expectOk(
        await records.insert(
          creationOf(
            undefined,
            withDefaults(
              aPage({
                body_markdown:
                  '## Apply\n\n:::action{form="birth-certificate"}\nApply now\n:::',
              }),
            ),
            new Date(),
          ),
        ),
      );
      await writeSearchChunks(db, page.id, [
        { heading: "Old", body: "Old regex projection" },
      ]);
      const beforePages = await db.select().from(contentPages);
      const beforeChunks = await db.select().from(searchChunks);
      const beforeHistory = await db.select().from(changeEvents);

      expect(expectOk(await reindexSearchChunks(db, "check"))).toEqual({
        pages: 1,
        chunks: 1,
      });
      expect(await db.select().from(searchChunks)).toEqual(beforeChunks);

      expect(expectOk(await reindexSearchChunks(db, "apply"))).toEqual({
        pages: 1,
        chunks: 1,
      });
      expect(
        await db
          .select({ heading: searchChunks.heading, body: searchChunks.body })
          .from(searchChunks),
      ).toEqual([{ heading: "Apply", body: "Apply now" }]);
      expect(await db.select().from(contentPages)).toEqual(beforePages);
      expect(await db.select().from(changeEvents)).toEqual(beforeHistory);
    } finally {
      await close();
    }
  });

  it("restores deleted chunks when Postgres refuses a replacement", async () => {
    const { db, close } = await createTestDb();
    try {
      const page = expectOk(
        await new PostgresPages(db).insert(
          creationOf(
            undefined,
            withDefaults(
              aPage({
                body_markdown: "New text",
              }),
            ),
            new Date(),
          ),
        ),
      );
      await writeSearchChunks(db, page.id, [
        { heading: null, body: "Old text" },
      ]);
      const before = await db.select().from(searchChunks);
      await db.execute(
        sql`alter table search_chunks add constraint reject_reindex_fixture check (body <> 'New text')`,
      );

      expect(await reindexSearchChunks(db, "apply")).toMatchObject({
        ok: false,
        error: { _tag: "ContentStoreUnavailable" },
      });
      expect(await db.select().from(searchChunks)).toEqual(before);
    } finally {
      await close();
    }
  });
});
