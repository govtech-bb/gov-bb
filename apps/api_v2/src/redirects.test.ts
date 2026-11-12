import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { PostgresPages } from "./adapters/postgres-pages";
import { Redacted } from "./modules/redacted";
import { PUBLIC_READ } from "./routes/responses";
import {
  ContentStoreUnavailable,
  fieldsOf,
  type EditorPage,
  type PageFields,
} from "./modules/page";
import { err } from "./modules/result";
import {
  categories,
  changeEvents,
  contentPages,
  pageRedirects,
  pageRevisions,
} from "./schema";
import { importEstate, seed } from "./seed";
import type { SeedEstate, SeedPage } from "./seed-data";
import {
  aPage,
  createTestApp,
  createTestDb,
  createTestServices,
  expectOk,
  SELF_APPROVAL,
  TEST_EMPLOYEE,
  type TestDb,
} from "./test-db";

let test: TestDb;
let services: ReturnType<typeof createTestServices>;
let records: PostgresPages;

beforeEach(async () => {
  test = await createTestDb();
  services = createTestServices(test.db, SELF_APPROVAL);
  records = new PostgresPages(test.db);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await test.close();
});

const create = async (url: string, fields: Partial<PageFields> = {}) =>
  expectOk(
    await services.editing.create(aPage({ url, ...fields }), TEST_EMPLOYEE),
  );
const save = async (page: EditorPage, fields: Partial<PageFields>) =>
  expectOk(
    await services.editing.save(
      page.id,
      { ...fieldsOf(page), ...fields },
      page.version,
      TEST_EMPLOYEE,
    ),
  );
const publish = async (page: EditorPage) => {
  const submitted = expectOk(
    await services.editing.submit(page.id, page.version, TEST_EMPLOYEE),
  );
  return expectOk(
    await services.editing.publish(page.id, submitted.version, TEST_EMPLOYEE),
  );
};
const move = async (page: EditorPage, url: string) =>
  publish(await save(page, { url }));
const rules = () =>
  test.db
    .select({
      source: pageRedirects.sourceUrl,
      destination: pageRedirects.destinationUrl,
    })
    .from(pageRedirects)
    .orderBy(pageRedirects.sourceUrl);
const recordRule = async (source: string, destination: string) =>
  expectOk(
    await records.atomically(TEST_EMPLOYEE.id, (tx) =>
      tx.recordPageRedirectMove(source, destination),
    ),
  );
const remove = async (page: EditorPage) =>
  expectOk(await services.editing.delete(page.id, page.version, TEST_EMPLOYEE));

async function hiddenMove() {
  const publicPage = await move(await create("/origin"), "/a");
  const hidden = await save(publicPage, { visibility: "draft" });
  return save(hidden, { url: "/b" });
}

// Corrupt only the scratch database to exercise evidence the production append-only log cannot repair.
async function rewriteHistory(statement: string, values: unknown[]) {
  await test.pool.query(
    "alter table change_events disable trigger change_events_no_mutate",
  );
  try {
    await test.pool.query(statement, values);
  } finally {
    await test.pool.query(
      "alter table change_events enable trigger change_events_no_mutate",
    );
  }
}

describe("redirect publication", () => {
  it("records published moves, flattens chains, moves back, and leaves child URLs alone", async () => {
    let page = await create("/a");
    const child = await create("/child", { parent_id: page.id });
    page = await move(page, "/b");
    page = await move(page, "/c");
    expect(await rules()).toEqual([
      { source: "/a", destination: "/c" },
      { source: "/b", destination: "/c" },
    ]);
    await move(page, "/a");
    expect(await rules()).toEqual([
      { source: "/b", destination: "/a" },
      { source: "/c", destination: "/a" },
    ]);
    expect(expectOk(await records.find(child.id))?.url).toBe("/child");
  });

  it.each(["draft", "preview"] as const)(
    "never records a never-public %s URL, including one with an imported publication date",
    async (visibility) => {
      let page = await create("/a", { visibility });
      await test.db
        .update(contentPages)
        .set({ publishedAt: new Date("2020-01-01") })
        .where(eq(contentPages.id, page.id));
      page =
        expectOk(await services.editing.open(page.id)) ?? expect.unreachable();
      page = await save(page, { url: "/b" });
      await save(page, { visibility: "public" });
      expect(await rules()).toEqual([]);
    },
  );

  it.each(["public", "draft", "preview"] as const)(
    "clears a reused source only when the replacement %s page is public",
    async (visibility) => {
      await move(await create("/a"), "/b");
      let replacement = await create("/a", { visibility });
      expect(await rules()).toEqual(
        visibility === "public" ? [] : [{ source: "/a", destination: "/b" }],
      );
      if (visibility !== "public")
        replacement = await save(replacement, { visibility: "public" });
      expect(await rules()).toEqual([]);
      await remove(replacement);
      expect(await rules()).toEqual([]);
    },
  );

  it("does not change rules on save, submit or reject", async () => {
    let page = await save(await create("/a"), { url: "/b" });
    expect(await rules()).toEqual([]);
    const submitted = expectOk(
      await services.editing.submit(page.id, page.version, TEST_EMPLOYEE),
    );
    expect(await rules()).toEqual([]);
    expectOk(
      await services.editing.reject(
        page.id,
        "Check this",
        submitted.version,
        TEST_EMPLOYEE,
      ),
    );
    expect(await rules()).toEqual([]);
    page =
      expectOk(await services.editing.open(page.id)) ?? expect.unreachable();
    await publish(page);
    expect(await rules()).toEqual([{ source: "/a", destination: "/b" }]);
  });

  it("rechecks destination ownership at publication without changing the pending revision", async () => {
    const pending = await save(await create("/a"), { url: "/b" });
    const submitted = expectOk(
      await services.editing.submit(pending.id, pending.version, TEST_EMPLOYEE),
    );
    await create("/b", { visibility: "draft" });
    const before = await test.db.select().from(changeEvents);
    expect(
      await services.editing.publish(
        pending.id,
        submitted.version,
        TEST_EMPLOYEE,
      ),
    ).toMatchObject({
      ok: false,
      error: { _tag: "PageRejected", errors: [{ field: "url" }] },
    });
    expect(await rules()).toEqual([]);
    expect(expectOk(await records.find(pending.id))?.url).toBe("/a");
    expect(await test.db.select().from(pageRevisions)).toMatchObject([
      { status: "submitted" },
    ]);
    expect(await test.db.select().from(changeEvents)).toEqual(before);
  });

  it("does not read or write redirect state for no-op or body-only saves", async () => {
    let page = await create("/a");
    const sources = vi.spyOn(
      PostgresPages.prototype,
      "redirectSourcesInSubtree",
    );
    const publicPages = vi.spyOn(
      PostgresPages.prototype,
      "publicPagesInSubtree",
    );
    page = await save(page, {});
    await publish(await save(page, { body_markdown: "Changed body" }));
    expect(sources).not.toHaveBeenCalled();
    expect(publicPages).not.toHaveBeenCalled();
    expect(await rules()).toEqual([]);
  });

  it("retains rules on unpublish and delete, without using the submitted hidden URL", async () => {
    const page = await move(await create("/a"), "/b");
    const hidden = await save(page, { visibility: "draft", url: "/secret" });
    expect(hidden.url).toBe("/b");
    expect(await rules()).toEqual([{ source: "/a", destination: "/b" }]);
    await remove(hidden);
    expect(await rules()).toEqual([{ source: "/a", destination: "/b" }]);
  });

  it("rejects an occupied restore destination at publication without changing routing or review state", async () => {
    const page = await move(await create("/a"), "/b");
    const restored = expectOk(
      await services.editing.restore(page.id, 1, page.version, TEST_EMPLOYEE),
    );
    const submitted = expectOk(
      await services.editing.submit(page.id, restored.version, TEST_EMPLOYEE),
    );
    await create("/a", { visibility: "draft" });
    const before = await test.db.select().from(changeEvents);
    expect(
      await services.editing.publish(page.id, submitted.version, TEST_EMPLOYEE),
    ).toMatchObject({
      ok: false,
      error: { _tag: "PageRejected", errors: [{ field: "url" }] },
    });
    expect(await rules()).toEqual([{ source: "/a", destination: "/b" }]);
    expect(expectOk(await records.find(page.id))?.url).toBe("/b");
    expect(expectOk(await services.editing.open(page.id))).toMatchObject({
      pending_revision: { status: "submitted" },
    });
    expect(await test.db.select().from(changeEvents)).toEqual(before);
  });

  it("waits for public restore publication and does not redirect never-public restores", async () => {
    let page = await move(await create("/a"), "/b");
    page = expectOk(
      await services.editing.restore(page.id, 1, page.version, TEST_EMPLOYEE),
    );
    expect(await rules()).toEqual([{ source: "/a", destination: "/b" }]);
    await publish(page);
    expect(await rules()).toEqual([{ source: "/b", destination: "/a" }]);
    let draft = await create("/draft-a", { visibility: "draft" });
    draft = await save(draft, { url: "/draft-b" });
    expectOk(
      await services.editing.restore(draft.id, 1, draft.version, TEST_EMPLOYEE),
    );
    expect(await rules()).toEqual([{ source: "/b", destination: "/a" }]);
  });
});

describe("redirect hierarchy and republication", () => {
  it("ignores intermediate hidden URLs and flattens incoming rules from the last public address", async () => {
    let page = await hiddenMove();
    page = await save(page, { url: "/c" });
    expect(await rules()).toEqual([{ source: "/origin", destination: "/a" }]);
    await save(page, { visibility: "public" });
    expect(await rules()).toEqual([
      { source: "/a", destination: "/c" },
      { source: "/origin", destination: "/c" },
    ]);
  });

  it("checks ancestors above the subtree and clears newly public descendant addresses", async () => {
    await move(await create("/child"), "/elsewhere");
    const ancestor = await create("/hidden", { visibility: "draft" });
    let parent = await create("/parent", { parent_id: ancestor.id });
    const child = await create("/child", { parent_id: parent.id });
    parent = await move(parent, "/renamed");
    expect(expectOk(await records.publicPagesInSubtree(parent.id))).toEqual([]);
    expect(await rules()).toEqual([
      { source: "/child", destination: "/elsewhere" },
    ]);
    await save(ancestor, { visibility: "public" });
    expect(await rules()).toEqual([]);
    expect(expectOk(await records.find(child.id))?.url).toBe("/child");
    expect(expectOk(await records.publicPagesInSubtree(parent.id))).toEqual(
      expect.arrayContaining([
        { id: parent.id, url: "/renamed" },
        { id: child.id, url: "/child" },
      ]),
    );
  });

  it.each(["publication", "reparenting"])(
    "recovers a descendant URL when ancestor %s makes it public again",
    async (action) => {
      let ancestor = await create("/ancestor");
      let child = await create("/old", { parent_id: ancestor.id });
      ancestor = await save(ancestor, { visibility: "draft" });
      child = await move(child, "/new");
      expect(await rules()).toEqual([]);
      if (action === "publication") {
        await save(ancestor, { visibility: "public" });
      } else {
        await publish(await save(child, { parent_id: null }));
      }
      expect(await rules()).toEqual([{ source: "/old", destination: "/new" }]);
    },
  );

  it("does not redirect a historical source reclaimed by another page in the same publication", async () => {
    let parent = await create("/a");
    let child = await create("/child-origin", { parent_id: parent.id });
    child = await move(child, "/b");
    parent = await save(parent, { visibility: "draft" });
    await move(child, "/c");
    await save(parent, { url: "/b", visibility: "public" });
    expect(await rules()).toEqual([
      { source: "/a", destination: "/b" },
      { source: "/child-origin", destination: "/b" },
    ]);
  });

  it("does not infer publication from transaction-start timestamps that reverse write order", async () => {
    let ancestor = await create("/ancestor");
    const child = await create("/a", { parent_id: ancestor.id });
    const delayed = await test.pool.connect();
    try {
      await delayed.query("begin; select pg_sleep(0.01)");
      ancestor = await save(ancestor, { visibility: "draft" });
      await delayed.query(
        "select pg_advisory_xact_lock(hashtext('content_pages.parent_id'))",
      );
      await delayed.query(
        "update content_pages set url = '/b', slug = 'b' where id = $1",
        [child.id],
      );
      await delayed.query("commit");
    } finally {
      await delayed.query("rollback");
      delayed.release();
    }
    const hidden =
      expectOk(await services.editing.open(child.id)) ?? expect.unreachable();
    await move(hidden, "/c");
    await save(ancestor, { visibility: "public" });
    expect(await rules()).toEqual([{ source: "/a", destination: "/c" }]);
  });

  it("finds publication caused only by an ancestor, not by a child snapshot", async () => {
    let ancestor = await create("/ancestor", { visibility: "draft" });
    const child = await create("/old", { parent_id: ancestor.id });
    ancestor = await save(ancestor, { visibility: "public" });
    ancestor = await save(ancestor, { visibility: "draft" });
    await move(child, "/new");
    await save(ancestor, { visibility: "public" });
    expect(await rules()).toEqual([{ source: "/old", destination: "/new" }]);
  });

  it("uses historical parent links rather than today's ancestry", async () => {
    const originalParent = await create("/original-parent");
    const hiddenParent = await create("/hidden-parent", {
      visibility: "draft",
    });
    let child = await create("/old", { parent_id: originalParent.id });
    child = await publish(await save(child, { parent_id: hiddenParent.id }));
    await save(originalParent, { visibility: "draft" });
    await move(child, "/new");
    await save(hiddenParent, { visibility: "public" });
    expect(await rules()).toEqual([{ source: "/old", destination: "/new" }]);
  });

  it.each(["draft", "preview", "public", "category", "redirect"] as const)(
    "does not reclaim a historical source occupied by a %s",
    async (occupier) => {
      const page = await hiddenMove();
      if (occupier === "category")
        await test.db.insert(categories).values({ slug: "a", title: "A" });
      else if (occupier === "redirect") await recordRule("/a", "/other");
      else await create("/a", { visibility: occupier });
      await recordRule("/b", "/unused");
      const before = (await rules()).filter(({ source }) => source !== "/b");
      await save(page, { visibility: "public" });
      expect(await rules()).toEqual(before);
    },
  );

  it.each([false, true])(
    "does not revive a publicly reused source after its new owner is deleted (ancestor publication=%s)",
    async (viaAncestor) => {
      const page = await hiddenMove();
      const parent = viaAncestor
        ? await create("/parent", { visibility: "draft" })
        : null;
      const replacement = await create("/a", { parent_id: parent?.id ?? null });
      if (parent) await save(parent, { visibility: "public" });
      await remove(replacement);
      await save(page, { visibility: "public" });
      expect(await rules()).toEqual([{ source: "/origin", destination: "/a" }]);
    },
  );

  it("can recover a source temporarily held only by a now-deleted draft", async () => {
    const page = await hiddenMove();
    await remove(await create("/a", { visibility: "draft" }));
    await save(page, { visibility: "public" });
    expect(await rules()).toEqual([
      { source: "/a", destination: "/b" },
      { source: "/origin", destination: "/b" },
    ]);
  });

  it("does not search through deletion and recreation of the same page id", async () => {
    const old = await create("/old");
    await remove(old);
    const replacement = expectOk(
      await services.editing.create(
        { ...aPage({ url: "/new", visibility: "draft" }), id: old.id },
        TEST_EMPLOYEE,
      ),
    );
    await save(replacement, { visibility: "public" });
    expect(await rules()).toEqual([]);
  });

  it("does not cross a deletion when a later creation event is missing", async () => {
    const old = await create("/old");
    await remove(old);
    let replacement = expectOk(
      await services.editing.create(
        {
          ...aPage({ url: "/replacement", visibility: "draft" }),
          id: old.id,
        },
        TEST_EMPLOYEE,
      ),
    );
    replacement = await save(replacement, { url: "/new" });
    await rewriteHistory(
      `delete from change_events where entity_id = $1
      and action = 'created' and version_no > 1`,
      [old.id],
    );
    await save(replacement, { visibility: "public" });
    expect(await rules()).toEqual([]);
  });

  it("does not treat a missing historical parent link as a public root", async () => {
    const parent = await create("/parent", { visibility: "draft" });
    const child = await create("/old", { parent_id: parent.id });
    await move(child, "/new");
    await rewriteHistory(
      `update change_events set snapshot = snapshot - 'parent_id'
      where entity_id = $1 and action = 'created'`,
      [child.id],
    );
    await save(parent, { visibility: "public" });
    expect(await rules()).toEqual([]);
  });

  it("terminates on hierarchy cycles without calling the subtree public", async () => {
    const page = await create("/cycle");
    await test.db
      .update(contentPages)
      .set({ parentId: page.id })
      .where(eq(contentPages.id, page.id));
    expect(expectOk(await records.publicPagesInSubtree(page.id))).toEqual([]);
  });

  it.each(["redacted", "unsupported"])(
    "does not infer an older public source through %s live evidence",
    async (gap) => {
      const page = await hiddenMove();
      await rewriteHistory(
        gap === "redacted"
          ? "update change_events set snapshot = '{\"redacted\":true}' where entity_id = $1 and action = 'updated'"
          : "update change_events set snapshot_version = 99 where entity_id = $1 and action = 'updated'",
        [page.id],
      );
      await save(page, { visibility: "public" });
      expect(await rules()).toEqual([{ source: "/origin", destination: "/a" }]);
    },
  );

  it("does not infer public ancestry across missing history", async () => {
    let ancestor = await create("/ancestor");
    const child = await create("/old", { parent_id: ancestor.id });
    ancestor = await save(ancestor, { visibility: "draft" });
    await move(child, "/new");
    await rewriteHistory("delete from change_events where entity_id = $1", [
      ancestor.id,
    ]);
    await save(ancestor, { visibility: "public" });
    expect(await rules()).toEqual([]);
  });

  it("uses audit order when different pages have equal timestamps", async () => {
    let ancestor = await create("/ancestor");
    const child = await create("/old", { parent_id: ancestor.id });
    ancestor = await save(ancestor, { visibility: "draft" });
    await move(child, "/new");
    await rewriteHistory(
      `update change_events set occurred_at = (
      select occurred_at from change_events where entity_id = $1 and action = 'unpublished'
    ) where entity_id = $2 and action = 'updated'`,
      [ancestor.id, child.id],
    );
    await save(ancestor, { visibility: "public" });
    expect(await rules()).toEqual([{ source: "/old", destination: "/new" }]);
  });

  it("does not reconstruct public paths from legacy history without audit order", async () => {
    const page = await hiddenMove();
    await rewriteHistory("update change_events set event_order = null", []);
    await save(page, { visibility: "public" });
    expect(await rules()).toEqual([{ source: "/origin", destination: "/a" }]);
  });

  it("recovers new ordered publications without relying on a legacy creation snapshot", async () => {
    let page = await create("/a", { visibility: "draft" });
    await rewriteHistory(
      "update change_events set event_order = null where entity_id = $1",
      [page.id],
    );
    page = await save(page, { visibility: "public" });
    page = await save(page, { visibility: "draft" });
    page = await save(page, { url: "/b" });
    await save(page, { visibility: "public" });
    expect(await rules()).toEqual([{ source: "/a", destination: "/b" }]);
  });

  it("does not infer historical public reachability through an unordered ancestor", async () => {
    const ancestor = await create("/ancestor");
    let child = await create("/a", { parent_id: ancestor.id });
    child = await save(child, { visibility: "draft" });
    child = await save(child, { url: "/b" });
    await rewriteHistory(
      "update change_events set event_order = null where entity_id = $1",
      [ancestor.id],
    );
    await save(child, { visibility: "public" });
    expect(await rules()).toEqual([]);
  });

  it("still records direct public moves when their older history is unordered", async () => {
    const page = await create("/a");
    await rewriteHistory(
      "update change_events set event_order = null where entity_id = $1",
      [page.id],
    );
    await move(page, "/b");
    expect(await rules()).toEqual([{ source: "/a", destination: "/b" }]);
  });

  it("does not reclaim a source when redaction hides a possible later owner", async () => {
    const page = await hiddenMove();
    const other = await create("/unrelated");
    await remove(other);
    await rewriteHistory(
      "update change_events set snapshot = '{\"redacted\":true}' where entity_id = $1",
      [other.id],
    );
    await save(page, { visibility: "public" });
    expect(await rules()).toEqual([{ source: "/origin", destination: "/a" }]);
  });
});

describe("redirect transactions", () => {
  it("propagates failed history reads without publishing or inventing a source", async () => {
    const page = await hiddenMove();
    const before = await test.db.select().from(changeEvents);
    vi.spyOn(
      PostgresPages.prototype,
      "redirectSourcesInSubtree",
    ).mockResolvedValueOnce(
      err(new ContentStoreUnavailable("history", new Error("offline"))),
    );
    expect(
      await services.editing.save(
        page.id,
        { ...fieldsOf(page), visibility: "public" },
        page.version,
        TEST_EMPLOYEE,
      ),
    ).toMatchObject({ ok: false, error: { _tag: "ContentStoreUnavailable" } });
    expect(expectOk(await records.find(page.id))?.visibility).toBe("draft");
    expect(await test.db.select().from(changeEvents)).toEqual(before);
    expect(await rules()).toEqual([{ source: "/origin", destination: "/a" }]);
  });

  it("rolls back the page, redirects, history and revision status if indexing fails after routing", async () => {
    const page = await move(await create("/origin"), "/a");
    await recordRule("/b", "/elsewhere");
    const pending = await save(page, { url: "/b" });
    const submitted = expectOk(
      await services.editing.submit(page.id, pending.version, TEST_EMPLOYEE),
    );
    const before = {
      rules: await rules(),
      history: await test.db
        .select()
        .from(changeEvents)
        .orderBy(changeEvents.id),
      revisions: await test.db
        .select()
        .from(pageRevisions)
        .orderBy(pageRevisions.id),
      pages: await test.db.select().from(contentPages).orderBy(contentPages.id),
    };
    await test.pool.query(`create function refuse_index() returns trigger as $$
      begin raise exception 'index write refused'; end; $$ language plpgsql;
      create trigger refuse_index before insert on search_chunks
        for each row execute function refuse_index()`);
    expect(
      await services.editing.publish(page.id, submitted.version, TEST_EMPLOYEE),
    ).toMatchObject({
      ok: false,
      error: {
        _tag: "ContentStoreUnavailable",
        operation: "replaceSearchChunks",
      },
    });
    expect({
      rules: await rules(),
      history: await test.db
        .select()
        .from(changeEvents)
        .orderBy(changeEvents.id),
      revisions: await test.db
        .select()
        .from(pageRevisions)
        .orderBy(pageRevisions.id),
      pages: await test.db.select().from(contentPages).orderBy(contentPages.id),
    }).toEqual(before);
  });
});

const seedPage = (url: string, fields: Partial<SeedPage> = {}): SeedPage => ({
  url,
  category: null,
  parent: null,
  title: "Page",
  description: null,
  visibility: "public",
  form_id: null,
  content_slug: "page",
  published_at: null,
  body_markdown: "Body",
  frontmatter: {},
  ...fields,
});

describe("redirects through seed and import", () => {
  it("clears rules only for successful, publicly reachable inserts", async () => {
    for (const url of ["/public", "/draft", "/preview", "/child"])
      await recordRule(url, "/destination");
    const estate: SeedEstate = {
      categories: [],
      pages: [
        seedPage("/public"),
        seedPage("/draft", { visibility: "draft" }),
        seedPage("/preview", { visibility: "preview" }),
        seedPage("/child", { parent: "/draft" }),
      ],
    };
    await seed(test.db, estate);
    expect(await rules()).toEqual([
      { source: "/child", destination: "/destination" },
      { source: "/draft", destination: "/destination" },
      { source: "/preview", destination: "/destination" },
    ]);
    await seed(test.db, {
      ...estate,
      pages: estate.pages.map((page) => ({ ...page, visibility: "public" })),
    });
    expect(await rules()).toHaveLength(3);
  });

  it("preserves incoming redirects when forced import recreates the destination with a new id", async () => {
    const page = await move(await create("/old"), "/destination");
    await recordRule("/reused", "/other");
    const estate: SeedEstate = {
      categories: [],
      pages: [seedPage("/destination"), seedPage("/reused")],
    };
    await importEstate(test.db, { dryRun: true, force: "test", estate });
    expect(await rules()).toHaveLength(2);
    await importEstate(test.db, { dryRun: false, force: "test", estate });
    expect(await rules()).toEqual([
      { source: "/old", destination: "/destination" },
    ]);
    const destination = expectOk(
      await records.pageOrRedirectAt("/destination"),
    );
    if (destination?.kind !== "page")
      expect.unreachable("Imported destination was not found");
    expect(destination.page.id).not.toBe(page.id);
    expect(
      expectOk(await services.resolution.resolve("/old", "public")),
    ).toEqual({
      kind: "redirect",
      url: "/destination",
    });
  });
});

describe("stored redirect HTTP resolution", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await createTestApp(test.db, {
      ...SELF_APPROVAL,
      previewSecret: new Redacted("secret"),
    });
  });
  afterEach(async () => {
    await app.close();
  });
  const read = (
    url: string,
    preview = false,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      url: `/pages?url=${encodeURIComponent(url)}`,
      headers: {
        ...headers,
        ...(preview ? { "x-preview-token": "secret" } : {}),
      },
    });

  it("serves flattened 301s with the stored Location, body and cache policy, never ETag or 304", async () => {
    let page = await create("/a");
    const child = await create("/child", { parent_id: page.id });
    const original = await read("/a");
    expect(original.statusCode).toBe(200);
    expect(original.headers.etag).toBeDefined();
    page = await move(page, "/b");
    page = await move(page, "/c");
    for (const source of ["/a", "/b"])
      for (const preview of [false, true])
        for (const etag of ["*", String(original.headers.etag)]) {
          const response = await read(source, preview, {
            "if-none-match": etag,
          });
          expect(response.statusCode).toBe(301);
          expect(response.headers.location).toBe("/c");
          expect(response.json()).toEqual({ redirect: "/c" });
          expect(response.headers["cache-control"]).toBe(
            preview ? "no-store" : PUBLIC_READ,
          );
          expect(response.headers.vary).toContain("x-preview-token");
          expect(response.headers.etag).toBeUndefined();
        }
    await move(page, "/a");
    expect((await read("/a")).statusCode).toBe(200);
    for (const source of ["/b", "/c"])
      expect((await read(source)).headers.location).toBe("/a");
    expect((await read(child.url)).json()).toMatchObject({ url: "/child" });
  });

  it.each(["draft", "preview", "public"] as const)(
    "keeps the rule ahead of a %s replacement until publication, and never revives it after deletion",
    async (visibility) => {
      await move(await create("/old"), "/new");
      let replacement = await create("/old", { visibility });
      for (const preview of [false, true]) {
        const response = await read("/old", preview);
        expect(response.statusCode).toBe(visibility === "public" ? 200 : 301);
        if (visibility !== "public")
          expect(response.headers.location).toBe("/new");
      }
      if (visibility !== "public")
        replacement = await save(replacement, { visibility: "public" });
      expect((await read("/old")).statusCode).toBe(200);
      await remove(replacement);
      expect((await read("/old")).statusCode).toBe(404);
    },
  );

  it.each(["draft", "preview"] as const)(
    "keeps the public Location when the destination becomes %s, without leaking its hidden rename",
    async (visibility) => {
      let page = await move(await create("/old"), "/public-target");
      page = await save(page, { visibility });
      expect((await read("/public-target")).statusCode).toBe(404);
      expect((await read("/public-target", true)).statusCode).toBe(
        visibility === "preview" ? 200 : 404,
      );
      for (const preview of [false, true])
        expect((await read("/old", preview)).headers.location).toBe(
          "/public-target",
        );
      await save(page, { url: "/hidden-name" });
      for (const preview of [false, true]) {
        expect((await read("/old", preview)).json()).toEqual({
          redirect: "/public-target",
        });
        expect((await read("/public-target", preview)).statusCode).toBe(404);
      }
    },
  );

  it("keeps a redirect through destination deletion and recreation under another ID", async () => {
    const original = await move(await create("/old"), "/new");
    await remove(original);
    expect((await read("/old")).headers.location).toBe("/new");
    expect((await read("/new")).statusCode).toBe(404);
    const replacement = await create("/new");
    expect(replacement.id).not.toBe(original.id);
    expect((await read("/old")).headers.location).toBe("/new");
    expect((await read("/new")).statusCode).toBe(200);
  });

  it("does not resolve, render or guess the destination of a stored rule", async () => {
    await recordRule("/old", "/missing");
    await create("/folder/missing");
    const lookup = vi.spyOn(PostgresPages.prototype, "pageOrRedirectAt");
    const ancestors = vi.spyOn(PostgresPages.prototype, "ancestorsOf");
    const start = vi.spyOn(PostgresPages.prototype, "startStepVisibility");
    const categories = vi.spyOn(PostgresPages.prototype, "categories");
    const slug = vi.spyOn(PostgresPages.prototype, "urlsWithSlug");
    const response = await read("/old");
    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe("/missing");
    expect(lookup).toHaveBeenCalledExactlyOnceWith("/old");
    for (const lookup of [ancestors, start, categories, slug])
      expect(lookup).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "https://elsewhere.example/path",
    "//elsewhere.example/path",
    "/\\elsewhere.example",
    "/bad\npath",
    "/old",
  ])(
    "refuses the unsafe or self-referential stored target %j without page or slug fallback",
    async (destinationUrl) => {
      await create("/folder/old");
      await create("/old", { visibility: "preview" });
      await test.pool.query(
        "alter table page_redirects drop constraint page_redirects_not_self",
      );
      await test.db
        .insert(pageRedirects)
        .values({ sourceUrl: "/old", destinationUrl });
      for (const preview of [false, true])
        expect((await read("/old", preview)).statusCode).toBe(404);
    },
  );

  it("does not decode or rewrite a stored destination path", async () => {
    const target = "/category/%72egister%20a%20birth";
    await recordRule("/old", target);
    const response = await read("/old");
    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe(target);
    expect(response.json()).toEqual({ redirect: target });
  });

  it("does not walk chains introduced outside the supported writer", async () => {
    await test.db.insert(pageRedirects).values([
      { sourceUrl: "/a", destinationUrl: "/b" },
      { sourceUrl: "/b", destinationUrl: "/c" },
    ]);
    expect((await read("/a")).headers.location).toBe("/b");
  });

  it("preserves exact-page visibility and bare-slug fallback when no rule exists", async () => {
    await create("/folder/entry");
    expect((await read("/entry")).headers.location).toBe("/folder/entry");
    const preview = await create("/entry", { visibility: "preview" });
    expect((await read("/entry")).statusCode).toBe(404);
    expect((await read("/entry", true)).statusCode).toBe(200);
    await save(preview, { url: "/preview-renamed" });
    expect((await read("/entry")).headers.location).toBe("/folder/entry");
  });

  it("returns a storage failure instead of a page, fallback redirect or invented 404 when lookup fails", async () => {
    await create("/old");
    await test.pool.query(
      "alter table page_redirects rename to unavailable_page_redirects",
    );
    const response = await read("/old");
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error" });
    expect(response.headers.location).toBeUndefined();
  });

  it("advances the site version for insertion, flattening and removal of rules", async () => {
    let page = await create("/a");
    const version = async () =>
      (await app.inject({ url: "/site-version" })).json().version;
    const before = await version();
    page = await move(page, "/b");
    const inserted = await version();
    expect(inserted).not.toBe(before);
    await move(page, "/c");
    const flattened = await version();
    expect(flattened).not.toBe(inserted);
    for (const url of ["/a", "/b"])
      expect((await read(url)).headers.location).toBe("/c");
    await create("/a");
    expect(await version()).not.toBe(flattened);
    expect((await read("/a")).statusCode).toBe(200);
  });
});
