/**
 * The seed is the whole estate, so it is also the widest test the schema
 * gets: every page's category and form have to satisfy their FKs, and every
 * page's markdown has to compile.
 */

import { describe, expect, it } from "vitest";
import { seed } from "./seed";
import { ESTATE } from "./seed-data";
import { ApiStore } from "./store";
import { createTestDb } from "./test-db";

describe("seed", () => {
  it("loads every page, category and form, and a second run adds nothing", async () => {
    const { db, close } = await createTestDb();

    expect(await seed(db)).toEqual({
      categories: ESTATE.categories.length,
      forms: ESTATE.forms.length,
      documents: ESTATE.pages.length,
    });
    expect(await seed(db)).toEqual({ categories: 0, forms: 0, documents: 0 });

    await close();
  }, 60_000);

  it("serves a seeded public page with its category crumb", async () => {
    const { db, close } = await createTestDb();
    await seed(db);

    const resolved = await new ApiStore(db).resolve(
      "/money-financial-support/calculate-severance-pay",
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
});
