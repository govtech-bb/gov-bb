/**
 * The seed is the whole estate, so it is also the widest test the schema
 * gets: every page's category and parent have to satisfy their keys, and a
 * sub-page has to share its parent's category.
 */

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { seed } from "./seed";
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
  it("loads every page and category, and a second run adds nothing", async () => {
    const { db, close } = await createTestDb();

    expect(await seed(db)).toEqual({
      categories: ESTATE.categories.length,
      documents: ESTATE.pages.length,
    });
    expect(await seed(db)).toEqual({ categories: 0, documents: 0 });

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
});
