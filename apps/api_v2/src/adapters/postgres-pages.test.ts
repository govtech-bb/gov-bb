import { describe, expect, it } from "vitest";
import { creationOf, PageRejected, withDefaults } from "../modules/page";
import { err } from "../modules/result";
import { contentPages } from "../schema";
import { aPage, createTestDb } from "../test-db";
import { PostgresPages } from "./postgres-pages";

describe("PostgresPages.atomically", () => {
  it("rolls back what the work wrote when it returns an error", async () => {
    const { db, close } = await createTestDb();
    try {
      const refusal = new PageRejected([{ field: "title", message: "No." }]);
      const outcome = await new PostgresPages(db).atomically(
        async (records) => {
          const inserted = await records.insert(
            creationOf(undefined, withDefaults(aPage()), new Date()),
          );
          return inserted.ok ? err(refusal) : inserted;
        },
      );

      expect(outcome).toEqual(err(refusal));
      expect(await db.select().from(contentPages)).toEqual([]);
    } finally {
      await close();
    }
  });
});
