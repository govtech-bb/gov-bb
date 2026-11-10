import { assert, describe, expect, it, vi } from "vitest";
import { creationOf, PageRejected, withDefaults } from "../modules/page";
import { err } from "../modules/result";
import {
  changeEventCounters,
  changeEvents,
  contentPages,
  pageRedirects,
} from "../schema";
import {
  aPage,
  createTestDb,
  createTestServices,
  expectOk,
  TEST_EMPLOYEE,
} from "../test-db";
import { PostgresPages } from "./postgres-pages";
import { CategoryId, parseCategoryFields } from "../modules/category";

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
      const id = expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) =>
          tx.insertCategory(fields, 0),
        ),
      );
      const duplicate = await records.atomically(TEST_EMPLOYEE.id, (tx) =>
        tx.insertCategory(fields, 1),
      );
      expect(duplicate).toMatchObject({
        ok: false,
        error: { _tag: "CategoryRejected", errors: [{ field: "slug" }] },
      });
      const missingParent = CategoryId.parse(
        "00000000-0000-4000-8000-000000000000",
      );
      const invalidParent = await records.atomically(TEST_EMPLOYEE.id, (tx) =>
        tx.replaceCategory(id, { ...fields, parent_id: missingParent }, 0),
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

describe("PostgresPages page redirects", () => {
  it("reads the rule and exact page in one statement and preserves Drizzle's column mapping", async () => {
    const { db, pool, close } = await createTestDb();
    const records = new PostgresPages(db);
    try {
      const page = expectOk(
        await createTestServices(db).editing.create(
          aPage({ url: "/source", visibility: "preview" }),
          TEST_EMPLOYEE,
        ),
      );
      const query = vi.spyOn(pool, "query");
      const found = expectOk(await records.pageOrRedirectAt("/source"));
      expect(query).toHaveBeenCalledTimes(1);
      assert(found?.kind === "page");
      expect(found.page).toMatchObject({
        id: page.id,
        url: "/source",
        visibility: "preview",
      });
      expect(found.page.contentUpdatedAt).toBeInstanceOf(Date);
      expect(found.page.updatedAt).toBeInstanceOf(Date);
      expect(found.page.frontmatter).toEqual(page.frontmatter);

      expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) =>
          tx.recordPageRedirectMove("/source", "/absent"),
        ),
      );
      query.mockClear();
      expect(expectOk(await records.pageOrRedirectAt("/source"))).toEqual({
        kind: "redirect",
        destinationUrl: "/absent",
      });
      expect(query).toHaveBeenCalledTimes(1);
      query.mockClear();
      expect(expectOk(await records.pageOrRedirectAt("/missing"))).toBeNull();
      expect(query).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
      await close();
    }
  });

  it("flattens published moves and can move back without a loop", async () => {
    const { db, close } = await createTestDb();
    try {
      const records = new PostgresPages(db);
      for (const [source, destination] of [
        ["/register-a-birth", "/register-birth"],
        ["/register-birth", "/birth-registration"],
      ] as const) {
        expectOk(
          await records.atomically(TEST_EMPLOYEE.id, (tx) =>
            tx.recordPageRedirectMove(source, destination),
          ),
        );
      }
      expect(
        await db.select().from(pageRedirects).orderBy(pageRedirects.sourceUrl),
      ).toMatchObject([
        {
          sourceUrl: "/register-a-birth",
          destinationUrl: "/birth-registration",
        },
        { sourceUrl: "/register-birth", destinationUrl: "/birth-registration" },
      ]);

      expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) =>
          tx.recordPageRedirectMove("/birth-registration", "/register-a-birth"),
        ),
      );
      expect(
        await db.select().from(pageRedirects).orderBy(pageRedirects.sourceUrl),
      ).toMatchObject([
        {
          sourceUrl: "/birth-registration",
          destinationUrl: "/register-a-birth",
        },
        { sourceUrl: "/register-birth", destinationUrl: "/register-a-birth" },
      ]);
    } finally {
      await close();
    }
  });

  it("keeps the audit id on upsert and advances the site version for every routing change", async () => {
    const { db, close } = await createTestDb();
    try {
      const records = new PostgresPages(db);
      const { navigation } = createTestServices(db);
      const initialVersion = expectOk(await navigation.version());
      expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) =>
          tx.recordPageRedirectMove("/old", "/current"),
        ),
      );
      const [rule] = await db.select().from(pageRedirects);
      assert(rule);
      const insertedVersion = expectOk(await navigation.version());
      expect(insertedVersion).not.toBe(initialVersion);

      expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) =>
          tx.recordPageRedirectMove("/old", "/new"),
        ),
      );
      expect(await db.select().from(pageRedirects)).toEqual([
        { ...rule, destinationUrl: "/new" },
      ]);
      const updatedVersion = expectOk(await navigation.version());
      expect(updatedVersion).not.toBe(insertedVersion);

      expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) =>
          tx.recordPageRedirectMove("/new", "/final"),
        ),
      );
      const flattenedVersion = expectOk(await navigation.version());
      expect(flattenedVersion).not.toBe(updatedVersion);
      expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) =>
          tx.removePageRedirectAt("/old"),
        ),
      );
      expect(expectOk(await navigation.version())).not.toBe(flattenedVersion);
      expect(await db.select().from(pageRedirects)).toMatchObject([
        { sourceUrl: "/new", destinationUrl: "/final" },
      ]);

      const history = await db
        .select()
        .from(changeEvents)
        .orderBy(changeEvents.versionNo);
      expect(
        history.filter((event) => event.entityId === rule.id),
      ).toMatchObject([
        {
          versionNo: 1,
          action: "created",
          snapshot: { source_url: "/old", destination_url: "/current" },
        },
        {
          versionNo: 2,
          action: "updated",
          snapshot: { source_url: "/old", destination_url: "/new" },
        },
        {
          versionNo: 3,
          action: "updated",
          snapshot: { source_url: "/old", destination_url: "/final" },
        },
        {
          versionNo: 4,
          action: "deleted",
          snapshot: { source_url: "/old", destination_url: "/final" },
        },
      ]);
      expect(history).toHaveLength(5);
      for (const event of history) {
        expect(event).toMatchObject({
          entityKind: "page_redirect",
          actor: TEST_EMPLOYEE.id,
        });
      }
    } finally {
      await close();
    }
  });

  it("leaves rules and history unchanged for equal paths and missing removals", async () => {
    const { db, close } = await createTestDb();
    try {
      const records = new PostgresPages(db);
      expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) =>
          tx.recordPageRedirectMove("/old", "/current"),
        ),
      );
      const rules = await db.select().from(pageRedirects);
      const history = await db.select().from(changeEvents);
      expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) =>
          tx.recordPageRedirectMove("/old", "/old"),
        ),
      );
      expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) =>
          tx.recordPageRedirectMove("/old", "/current"),
        ),
      );
      expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) =>
          tx.removePageRedirectAt("/missing"),
        ),
      );
      expect(await db.select().from(pageRedirects)).toEqual(rules);
      expect(await db.select().from(changeEvents)).toEqual(history);
    } finally {
      await close();
    }
  });

  it("keeps incoming rules when the destination is deleted and recreated under a new id", async () => {
    const { db, close } = await createTestDb();
    try {
      const records = new PostgresPages(db);
      const page = creationOf(
        undefined,
        withDefaults(aPage({ url: "/current" })),
        new Date(),
      );
      const original = expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) => tx.insert(page)),
      );
      expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) =>
          tx.recordPageRedirectMove("/old", "/current"),
        ),
      );
      const rules = await db.select().from(pageRedirects);
      expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) =>
          tx.remove(original.id),
        ),
      );
      expect(await db.select().from(pageRedirects)).toEqual(rules);
      const recreated = expectOk(
        await records.atomically(TEST_EMPLOYEE.id, (tx) => tx.insert(page)),
      );
      expect(recreated.id).not.toBe(original.id);
      expect(await db.select().from(pageRedirects)).toEqual(rules);
    } finally {
      await close();
    }
  });

  it.each(["failed result", "storage failure"])(
    "rolls back rule inserts, updates, deletes and page writes on %s",
    async (failure) => {
      const { db, pool, close } = await createTestDb();
      try {
        const records = new PostgresPages(db);
        for (const [source, destination] of [
          ["/a", "/b"],
          ["/c", "/d"],
        ] as const) {
          expectOk(
            await records.atomically(TEST_EMPLOYEE.id, (tx) =>
              tx.recordPageRedirectMove(source, destination),
            ),
          );
        }
        const rules = await db
          .select()
          .from(pageRedirects)
          .orderBy(pageRedirects.sourceUrl);
        const history = await db
          .select()
          .from(changeEvents)
          .orderBy(changeEvents.id);
        const counters = await db
          .select()
          .from(changeEventCounters)
          .orderBy(changeEventCounters.entityId);
        if (failure === "storage failure") {
          await pool.query(`create function refuse_redirect() returns trigger as $$
            begin raise exception 'redirect write refused'; end;
            $$ language plpgsql;
            create trigger refuse_redirect before insert on page_redirects
              for each row execute function refuse_redirect()`);
        }
        const refusal = new PageRejected([{ field: "title", message: "No." }]);
        const outcome = await records.atomically(
          TEST_EMPLOYEE.id,
          async (tx) => {
            const page = await tx.insert(
              creationOf(undefined, withDefaults(aPage()), new Date()),
            );
            if (!page.ok) return page;
            const moved = await tx.recordPageRedirectMove("/b", "/c");
            return moved.ok ? err(refusal) : moved;
          },
        );
        if (failure === "storage failure") {
          expect(outcome).toMatchObject({
            ok: false,
            error: {
              _tag: "ContentStoreUnavailable",
              operation: "recordPageRedirectMove",
            },
          });
        } else {
          expect(outcome).toEqual(err(refusal));
        }
        expect(await db.select().from(contentPages)).toEqual([]);
        expect(
          await db
            .select()
            .from(pageRedirects)
            .orderBy(pageRedirects.sourceUrl),
        ).toEqual(rules);
        expect(
          await db.select().from(changeEvents).orderBy(changeEvents.id),
        ).toEqual(history);
        expect(
          await db
            .select()
            .from(changeEventCounters)
            .orderBy(changeEventCounters.entityId),
        ).toEqual(counters);
      } finally {
        await close();
      }
    },
  );
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
