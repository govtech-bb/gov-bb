import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, expect, it } from "vitest";
import { PostgresPages } from "./adapters/postgres-pages";
import { withDefaults, type PageId } from "./modules/page";
import { PageEditing } from "./services/page-editing";
import {
  aPage,
  createTestApp,
  createTestDb,
  createTestServices,
  expectOk,
  SELF_APPROVAL,
  takeTestPageEditLock,
  TEST_EMPLOYEE,
  type TestDb,
} from "./test-db";

let database: TestDb;
let app: FastifyInstance;
beforeEach(async () => {
  database = await createTestDb();
  app = await createTestApp(database.db);
});
afterEach(async () => {
  await app.close();
  await database.close();
});

it.each(["page", "revision"] as const)(
  "reads %s content and its version from one snapshot during a concurrent save",
  async (view) => {
    const writer = createTestServices(database.db, SELF_APPROVAL).editing;
    const page = expectOk(await writer.create(aPage(), TEST_EMPLOYEE));
    const token = await takeTestPageEditLock(writer, page.id);
    const first = expectOk(
      await writer.save(
        page.id,
        withDefaults(aPage({ title: "First revision" })),
        page.version,
        token,
        TEST_EMPLOYEE,
      ),
    );
    let writes = 0;
    const interleave = async () => {
      const second = expectOk(
        await writer.save(
          page.id,
          withDefaults(aPage({ title: "Second revision" })),
          first.version,
          token,
          TEST_EMPLOYEE,
        ),
      );
      expect(second.version).toBeGreaterThan(first.version);
      writes++;
    };

    // Commit a real competing save after the first read has captured its rows.
    class InterleavedPageReads extends PostgresPages {
      override async find(id: PageId) {
        const result = await super.find(id);
        await interleave();
        return result;
      }
      override async editorSnapshot(id: PageId) {
        const result = await super.editorSnapshot(id);
        await interleave();
        return result;
      }
    }
    const reader = new PageEditing(
      new InterleavedPageReads(database.db),
      () => new Date(),
      SELF_APPROVAL,
    );
    const result =
      view === "page"
        ? expectOk(await reader.open(page.id))
        : expectOk(await reader.revision(page.id));
    expect(writes).toBe(1);
    expect(result).toMatchObject({
      version: first.version,
      ...(view === "page"
        ? { title: first.title }
        : { fields: { title: first.title } }),
    });
    expect(expectOk(await writer.open(page.id))?.title).toBe("Second revision");
  },
);
