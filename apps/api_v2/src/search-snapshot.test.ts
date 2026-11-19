import { EventEmitter, once } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresPages } from "./adapters/postgres-pages";
import { fieldsOf } from "./modules/page";
import {
  aPage,
  createTestDb,
  createTestServices,
  expectOk,
  SELF_APPROVAL,
  TEST_EMPLOYEE,
  type TestDb,
} from "./test-db";

let test: TestDb;
beforeEach(async () => {
  test = await createTestDb();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await test.close();
});

describe("search snapshots", () => {
  it.each(["public", "preview"] as const)(
    "keeps %s metadata and chunks together across an unpublish and private draft save",
    async (viewer) => {
      const { editing, navigation } = createTestServices(
        test.db,
        SELF_APPROVAL,
      );
      const page = expectOk(
        await editing.create(
          aPage({
            url: "/public-page",
            title: "Public title",
            description: "Public description",
            frontmatter: { keywords: ["public"] },
            body_markdown:
              "Public introduction.\n\n## Details\n\nPublic details.",
          }),
          TEST_EMPLOYEE,
        ),
      );
      const before = expectOk(await navigation.searchDocuments(viewer));
      expect(before).toEqual([
        {
          url: "/public-page",
          title: "Public title",
          description: "Public description",
          digital: false,
          keywords: ["public"],
          chunks: [
            { heading: null, body: "Public introduction." },
            { heading: "Details", body: "Public details." },
          ],
        },
      ]);

      const gate = new EventEmitter();
      const selected = once(gate, "selected");
      const resumed = once(gate, "resume");
      const visiblePages = PostgresPages.prototype.visiblePages;
      // Hold the real Postgres result while a different connection commits both saves.
      vi.spyOn(PostgresPages.prototype, "visiblePages").mockImplementationOnce(
        async function (this: PostgresPages, visibilities) {
          const result = await visiblePages.call(this, visibilities);
          gate.emit("selected");
          await resumed;
          return result;
        },
      );
      const search = navigation.searchDocuments(viewer);
      try {
        await selected;
        const unpublished = expectOk(
          await editing.save(
            page.id,
            { ...fieldsOf(page), visibility: "draft" },
            page.version,
            TEST_EMPLOYEE,
          ),
        );
        const saved = expectOk(
          await editing.save(
            page.id,
            {
              ...fieldsOf(unpublished),
              title: "Private title",
              description: "Private description",
              frontmatter: { keywords: ["private"] },
              body_markdown: "Private text that was never public.",
            },
            unpublished.version,
            TEST_EMPLOYEE,
          ),
        );
        expect(saved.visibility).toBe("draft");
        gate.emit("resume");
        expect(expectOk(await search)).toEqual(before);
        expect(expectOk(await navigation.searchDocuments("public"))).toEqual(
          [],
        );
        expect(expectOk(await navigation.searchDocuments("preview"))).toEqual(
          [],
        );
      } finally {
        gate.emit("resume");
        await search;
      }
    },
  );

  it("preserves ancestor visibility, empty chunks and catalog/start-step behavior", async () => {
    const { editing, navigation } = createTestServices(test.db, SELF_APPROVAL);
    const page = async (overrides: Record<string, unknown>) =>
      expectOk(await editing.create(aPage(overrides), TEST_EMPLOYEE));
    for (const viewer of ["public", "preview"] as const)
      expect(expectOk(await navigation.searchDocuments(viewer))).toEqual([]);

    await page({ url: "/empty", title: "Empty", body_markdown: "" });
    await page({ url: "/start", title: "Root start", form_id: "root-form" });
    const parent = await page({
      url: "/preview",
      title: "Preview parent",
      visibility: "preview",
    });
    await page({
      url: "/preview/child",
      title: "Child",
      parent_id: parent.id,
    });
    const start = await page({
      url: "/preview/start",
      title: "Start step",
      parent_id: parent.id,
      form_id: "start-form",
    });
    await page({
      url: "/preview/start/note",
      title: "Note",
      parent_id: start.id,
    });

    const publicDocuments = expectOk(
      await navigation.searchDocuments("public"),
    );
    expect(publicDocuments.map((document) => document.url)).toEqual([
      "/empty",
      "/start",
    ]);
    expect(publicDocuments[0]).toEqual({
      url: "/empty",
      title: "Empty",
      description: null,
      digital: false,
      keywords: [],
      chunks: [],
    });
    expect(publicDocuments[1]).toMatchObject({ digital: true });
    const preview = expectOk(await navigation.searchDocuments("preview"));
    expect(preview.map((document) => document.url)).toEqual([
      "/preview/child",
      "/empty",
      "/preview/start/note",
      "/preview",
      "/start",
    ]);
    expect(
      preview.find((document) => document.url === "/preview"),
    ).toMatchObject({
      digital: false,
    });
    expect(expectOk(await navigation.catalog("preview"))).toContainEqual(
      expect.objectContaining({ url: "/preview", form_id: "start-form" }),
    );

    expectOk(
      await editing.save(
        parent.id,
        { ...fieldsOf(parent), visibility: "draft" },
        parent.version,
        TEST_EMPLOYEE,
      ),
    );
    for (const viewer of ["public", "preview"] as const)
      expect(expectOk(await navigation.searchDocuments(viewer))).toEqual(
        publicDocuments,
      );
  });

  it.each([
    ["content_pages", "visiblePages"],
    ["search_chunks", "searchChunksOf"],
  ] as const)(
    "preserves the storage error when %s cannot be read",
    async (table, operation) => {
      const { editing, navigation } = createTestServices(
        test.db,
        SELF_APPROVAL,
      );
      expectOk(await editing.create(aPage(), TEST_EMPLOYEE));
      await test.pool.query(
        `alter table ${table} rename to unavailable_search_fixture`,
      );

      expect(await navigation.searchDocuments("public")).toMatchObject({
        ok: false,
        error: { _tag: "ContentStoreUnavailable", operation },
      });
    },
  );
});
