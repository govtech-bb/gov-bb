import { describe, expect, it } from "vitest";
import { creationOf, PageRejected, withDefaults } from "../modules/page";
import { err } from "../modules/result";
import { contentPages } from "../schema";
import { aPage, createTestDb, expectOk, TEST_EMPLOYEE } from "../test-db";
import { PostgresPages } from "./postgres-pages";
import {
  CategoryId,
  CategoryStamp,
  parseCategoryFields,
} from "../modules/category";

describe("PostgresPages category constraints", () => {
  it("translates unique slug and parent foreign-key refusals without partial writes", async () => {
    const { db, close } = await createTestDb();
    try {
      const records = new PostgresPages(db);
      const fields = expectOk(
        parseCategoryFields({
          title: "Category",
          slug: "category",
          parent_id: null,
          description: null,
        }),
      );
      const stamp = CategoryStamp.parse("2026-10-26T12:00:00.000Z");
      const id = expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) =>
          tx.insertCategory(fields, 0, stamp),
        ),
      );
      const duplicate = await records.atomically(TEST_EMPLOYEE.id, (tx) =>
        tx.insertCategory(fields, 1, stamp),
      );
      expect(duplicate).toMatchObject({
        ok: false,
        error: { _tag: "CategoryRejected", errors: [{ field: "slug" }] },
      });
      const missingParent = CategoryId.parse(
        "00000000-0000-4000-8000-000000000000",
      );
      const invalidParent = await records.atomically(TEST_EMPLOYEE.id, (tx) =>
        tx.replaceCategory(
          id,
          { ...fields, parent_id: missingParent },
          0,
          stamp,
        ),
      );
      expect(invalidParent).toMatchObject({
        ok: false,
        error: { _tag: "CategoryRejected", errors: [{ field: "parent_id" }] },
      });
      expect(expectOk(await records.editorCategories())).toMatchObject([
        { id, parent_id: null, position: 0 },
      ]);
    } finally {
      await close();
    }
  });
});

describe("PostgresPages.atomically", () => {
  it("rolls back what the work wrote when it returns an error", async () => {
    const { db, close } = await createTestDb();
    try {
      const refusal = new PageRejected([{ field: "title", message: "No." }]);
      const outcome = await new PostgresPages(db).atomically(
        TEST_EMPLOYEE.id,
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
