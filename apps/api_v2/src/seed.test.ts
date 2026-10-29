/**
 * The seed is the whole estate, so it is also the widest test the schema
 * gets: every page's category and parent have to satisfy their keys, and a
 * sub-page has to share its parent's category.
 */

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Database } from "./db";
import { importEstate, seed } from "./seed";
import { ESTATE } from "./seed-data";
import { Redacted } from "./modules/redacted";
import { PREVIEW_TOKEN } from "./routes/site";
import {
  createTestApp,
  createTestDb,
  createTestServices,
  expectOk,
} from "./test-db";

describe("seed", () => {
  it("records the markdown commit the snapshot came from", () => {
    expect(ESTATE.source).toMatch(/^[0-9a-f]{40}$/);
  });

  it("files every page under a known category and parent", () => {
    const slugs = new Set(ESTATE.categories.map((category) => category.slug));
    const urls = new Set(ESTATE.pages.map((page) => page.url));
    expect(
      ESTATE.pages
        .filter(
          (page) =>
            (page.category !== null && !slugs.has(page.category)) ||
            (page.parent !== null && !urls.has(page.parent)),
        )
        .map((page) => page.url),
    ).toEqual([]);
  });

  it("loads every page and category, and a second run adds nothing", async () => {
    const { db, close } = await createTestDb();

    expect(await seed(db)).toEqual({
      categories: ESTATE.categories.length,
      documents: ESTATE.pages.length,
    });
    expect(await seed(db)).toEqual({ categories: 0, documents: 0 });
    // Each page's and category's history starts where the seed left it,
    // and only once.
    expect(expectOk(await createTestServices(db).index.version()).count).toBe(
      ESTATE.pages.length + ESTATE.categories.length,
    );

    await close();
  }, 60_000);

  it("serves a seeded public page with its category crumb", async () => {
    const { db, close } = await createTestDb();
    await seed(db);

    const resolved = expectOk(
      await createTestServices(db).resolution.resolve(
        "/money-financial-support/calculate-severance-pay",
        "public",
      ),
    );

    expect(resolved).toMatchObject({
      kind: "page",
      page: {
        breadcrumbs: [
          {
            name: "Money and financial support",
            url: "/money-financial-support",
          },
          {
            name: "Find out how much severance payment you are owed",
            url: "/money-financial-support/calculate-severance-pay",
          },
        ],
      },
    });

    await close();
  }, 60_000);

  it("files subcategories, sub-pages and the pages landing nests by hand", async () => {
    const { db, close } = await createTestDb();
    await seed(db);

    const { rows } = await db.execute<{
      url: string;
      parent: string | null;
      category: string | null;
    }>(
      sql`select p.url, parent.url as parent, c.slug as category
          from content_pages p
          left join content_pages parent on parent.id = p.parent_id
          left join categories c on c.id = p.category_id
          where p.url in (
            '/health-and-emergency-services/prescription-colours',
            '/business-trade/sell-goods-services-beach-park/start',
            '/youth-and-community/arts-culture/community-canvas'
          )
          order by p.url`,
    );
    expect(rows).toEqual([
      {
        url: "/business-trade/sell-goods-services-beach-park/start",
        parent: "/business-trade/sell-goods-services-beach-park",
        category: "business-trade",
      },
      {
        url: "/health-and-emergency-services/prescription-colours",
        parent: "/health-and-emergency-services/find-an-open-pharmacy",
        category: "health-and-emergency-services",
      },
      {
        url: "/youth-and-community/arts-culture/community-canvas",
        parent: null,
        category: "arts-culture",
      },
    ]);

    const subcategory = await db.execute<{ parent: string; position: number }>(
      sql`select parent.slug as parent, c.position from categories c
          join categories parent on parent.id = c.parent_id
          where c.slug = 'arts-culture'`,
    );
    expect(subcategory.rows).toEqual([
      { parent: "youth-and-community", position: 3 },
    ]);

    const topLevel = await db.execute<{ slug: string }>(
      sql`select slug from categories where parent_id is null order by position`,
    );
    expect(topLevel.rows.map((row) => row.slug)).toEqual(
      ESTATE.categories
        .filter((category) => category.parent === null)
        .map((category) => category.slug),
    );

    await close();
  }, 60_000);

  it("indexes every page with a body for search", async () => {
    const { db, close } = await createTestDb();
    await seed(db);

    const { rows } = await db.execute<{ unindexed: number }>(
      sql`select count(*)::int as unindexed from content_pages p
          where btrim(p.body_markdown) <> ''
            and not exists (select 1 from search_chunks s where s.page_id = p.id)`,
    );
    expect(rows).toEqual([{ unindexed: 0 }]);

    await close();
  }, 60_000);

  it("serves every seeded url, to the public and in preview, without a 500", async () => {
    // Responses are checked against their schema on the way out, so a page
    // the contract cannot describe would fail here rather than in production.
    const { db, close } = await createTestDb();
    await seed(db);
    const app = await createTestApp(db, {
      previewSecret: new Redacted("preview"),
    });

    const failed: string[] = [];
    for (const { url } of ESTATE.pages) {
      for (const headers of [{}, { [PREVIEW_TOKEN]: "preview" }]) {
        const response = await app.inject({
          url: `/pages?url=${encodeURIComponent(url)}`,
          headers,
        });
        if (response.statusCode >= 500) failed.push(url);
      }
    }
    expect(failed).toEqual([]);

    await app.close();
    await close();
  }, 60_000);

  it("imports the estate once as system, naming the markdown commit in its report", async () => {
    const { db, close } = await createTestDb();

    const report = await importEstate(db, { dryRun: false });

    expect(report).toEqual({
      source: ESTATE.source,
      reason: null,
      existing: 0,
      actors: {},
      categories: ESTATE.categories.length,
      documents: ESTATE.pages.length,
    });
    const { rows } = await db.execute<{ actor: string }>(
      sql`select distinct actor from change_events`,
    );
    expect(rows.map((row) => row.actor)).toEqual(["system"]);

    await close();
  }, 60_000);

  it("refuses when content already exists and writes nothing", async () => {
    const { db, close } = await createTestDb();
    await seed(db);
    const history = await countOf(db, "change_events");

    const refusal = importEstate(db, { dryRun: false });
    await expect(refusal).rejects.toThrow(/refusing/);
    await expect(refusal).rejects.toThrow(
      `system=${ESTATE.pages.length + ESTATE.categories.length}`,
    );
    expect(await countOf(db, "content_pages")).toBe(ESTATE.pages.length);
    expect(await countOf(db, "change_events")).toBe(history);

    await close();
  }, 60_000);

  it("dry run reports the counts and leaves nothing behind", async () => {
    const { db, close } = await createTestDb();

    expect(await importEstate(db, { dryRun: true })).toEqual({
      source: ESTATE.source,
      reason: null,
      existing: 0,
      actors: {},
      categories: ESTATE.categories.length,
      documents: ESTATE.pages.length,
    });
    expect(await countOf(db, "content_pages")).toBe(0);
    expect(await countOf(db, "categories")).toBe(0);
    expect(await countOf(db, "change_events")).toBe(0);

    await close();
  }, 60_000);

  it("dry run with force leaves existing content and history untouched", async () => {
    const { db, close } = await createTestDb();
    await seed(db);
    const history = await countOf(db, "change_events");

    const report = await importEstate(db, { dryRun: true, force: "rehearsal" });

    expect(report.existing).toBe(ESTATE.pages.length);
    expect(report.categories).toBe(ESTATE.categories.length);
    expect(report.documents).toBe(ESTATE.pages.length);
    expect(await countOf(db, "content_pages")).toBe(ESTATE.pages.length);
    expect(await countOf(db, "categories")).toBe(ESTATE.categories.length);
    expect(await countOf(db, "change_events")).toBe(history);

    await close();
  }, 60_000);

  it("force replaces existing content in one transaction and reports the reason", async () => {
    const { db, close } = await createTestDb();
    await seed(db);

    const report = await importEstate(db, {
      dryRun: false,
      force: "test replace",
    });

    expect(report).toEqual({
      source: ESTATE.source,
      reason: "test replace",
      existing: ESTATE.pages.length,
      actors: { system: ESTATE.pages.length + ESTATE.categories.length },
      categories: ESTATE.categories.length,
      documents: ESTATE.pages.length,
    });
    expect(await countOf(db, "content_pages")).toBe(ESTATE.pages.length);

    await close();
  }, 60_000);

  it("force records the replaced pages and categories as deleted", async () => {
    const { db, close } = await createTestDb();
    await seed(db);
    const { rows: replaced } = await db.execute<{ id: string }>(
      sql`select id from content_pages union all select id from categories`,
    );

    await importEstate(db, { dryRun: false, force: "test history" });

    const { rows: latest } = await db.execute<{
      entity_id: string;
      action: string;
      actor: string;
    }>(
      sql`select distinct on (entity_id) entity_id, action, actor
            from change_events order by entity_id, version_no desc`,
    );
    const ids = new Set(replaced.map((row) => row.id));
    const last = latest.filter((row) => ids.has(row.entity_id));
    expect(last).toHaveLength(replaced.length);
    expect(new Set(last.map((row) => `${row.action}:${row.actor}`))).toEqual(
      new Set(["deleted:system"]),
    );

    await close();
  }, 60_000);

  it("force also clears categories left behind without pages", async () => {
    const { db, close } = await createTestDb();
    await seed(db);
    await db.execute(
      sql`truncate search_chunks, page_revisions, content_pages`,
    );

    const report = await importEstate(db, {
      dryRun: false,
      force: "test leftovers",
    });

    expect(report.existing).toBe(0);
    expect(report.categories).toBe(ESTATE.categories.length);
    expect(report.documents).toBe(ESTATE.pages.length);
    expect(await countOf(db, "categories")).toBe(ESTATE.categories.length);

    await close();
  }, 60_000);

  it("a failure part-way leaves no partial estate", async () => {
    const { db, close } = await createTestDb();
    // The first page's search chunks fail after the categories and that page
    // went in.
    await db.execute(sql`drop table search_chunks`);

    await expect(importEstate(db, { dryRun: false })).rejects.toThrow();
    expect(await countOf(db, "categories")).toBe(0);
    expect(await countOf(db, "content_pages")).toBe(0);

    await close();
  }, 60_000);
});

async function countOf(db: Database, table: string) {
  const { rows } = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from ${sql.identifier(table)}`,
  );
  return rows[0]!.n;
}
