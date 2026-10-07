/**
 * What the site navigates by — categories, a category's listing, the catalog
 * and search text — as the public reads it and as a reviewer with the preview
 * token does.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { EDITOR_READ, NOT_FOUND_READ, PUBLIC_READ } from "./routes/responses";
import { Redacted } from "./modules/redacted";
import { categories } from "./schema";
import {
  aPage,
  createTestApp,
  createTestDb,
  createTestServices,
  expectOk,
  TEST_EMPLOYEE,
  TEST_HTTP_CONFIG,
  type TestDb,
} from "./test-db";

const SECRET = "preview-secret-for-tests";

let test: TestDb;
let app: FastifyInstance;

const get = (url: string, token?: string) =>
  app.inject({
    url,
    headers: token === undefined ? {} : { "x-preview-token": token },
  });

/**
 * Youth (listed first) has a subcategory, Arts; Money lists three public
 * pages, a preview one, a start step and a sub-page; Housing lists nothing.
 */
beforeAll(async () => {
  test = await createTestDb();
  const { editing } = createTestServices(test.db);
  const page = async (overrides: Record<string, unknown>) =>
    expectOk(await editing.create(aPage(overrides), TEST_EMPLOYEE));

  const [youth, money] = await test.db
    .insert(categories)
    .values([
      { slug: "youth", title: "Youth", position: 0 },
      { slug: "money", title: "Money", description: "Pay", position: 1 },
      { slug: "housing", title: "Housing", position: 2 },
    ])
    .returning();
  if (!youth || !money) throw new Error("The categories were not inserted");
  const [arts] = await test.db
    .insert(categories)
    .values({ slug: "arts", title: "Arts", parentId: youth.id })
    .returning();
  if (!arts) throw new Error("The subcategory was not inserted");

  const apply = await page({
    url: "/money/apply",
    title: "Apply for a grant",
    category_id: money.id,
    form_id: "grant",
    frontmatter: { stage: "alpha", keywords: ["grant", "money"] },
    body_markdown: "Who can apply.\n\n## Fees\n\nIt is free.",
  });
  await page({
    url: "/money/apply/start",
    title: "Start",
    category_id: money.id,
    parent_id: apply.id,
  });
  await page({
    url: "/money/apply/notes",
    title: "About grants",
    category_id: money.id,
    parent_id: apply.id,
  });
  await page({
    url: "/money/budget",
    title: "Budget guide",
    category_id: money.id,
  });
  await page({
    url: "/money/draft-idea",
    title: "Coming soon",
    category_id: money.id,
    visibility: "preview",
  });
  await page({
    url: "/youth/arts/canvas",
    title: "Canvas",
    category_id: arts.id,
    frontmatter: { service_type: "digital" },
  });

  app = await createTestApp(test.db, {
    previewSecret: new Redacted(SECRET),
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await test.close();
});

describe("GET /categories", () => {
  it("lists categories with something to list, in order, with their subcategories", async () => {
    const response = await get("/categories");

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe(PUBLIC_READ);
    expect(response.headers.vary).toContain("x-preview-token");
    expect(response.json()).toEqual({
      categories: [
        {
          slug: "youth",
          url: "/youth",
          title: "Youth",
          description: null,
          subcategories: [
            {
              slug: "arts",
              url: "/youth/arts",
              title: "Arts",
              description: null,
            },
          ],
        },
        {
          slug: "money",
          url: "/money",
          title: "Money",
          description: "Pay",
          subcategories: [],
        },
      ],
    });
  });
});

describe("Vary", () => {
  it("keys public reads on the preview token without dropping CORS's Origin", async () => {
    const response = await app.inject({
      url: "/categories",
      headers: { origin: TEST_HTTP_CONFIG.editorOrigin },
    });

    expect(response.headers["access-control-allow-origin"]).toBe(
      TEST_HTTP_CONFIG.editorOrigin,
    );
    const vary = String(response.headers.vary)
      .split(",")
      .map((value) => value.trim().toLowerCase());
    expect(vary).toEqual(expect.arrayContaining(["origin", "x-preview-token"]));
  });
});

describe("GET /categories/:slug", () => {
  it("lists the public pages at the category's root, A to Z", async () => {
    const response = await get("/categories/money");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      category: {
        slug: "money",
        url: "/money",
        title: "Money",
        description: "Pay",
      },
      parent: null,
      subcategories: [],
      pages: [
        {
          url: "/money/apply",
          title: "Apply for a grant",
          description: null,
          digital: true,
        },
        {
          url: "/money/budget",
          title: "Budget guide",
          description: null,
          digital: false,
        },
      ],
    });
  });

  it("lists a parent category's subcategories", async () => {
    const response = await get("/categories/youth");

    expect(response.json()).toMatchObject({
      subcategories: [{ slug: "arts", url: "/youth/arts" }],
      pages: [],
    });
  });

  it.each(["/categories/housing", "/categories/arts", "/categories/nope"])(
    "404s %s, which lists nothing at that address",
    async (url) => {
      const response = await get(url);

      expect(response.statusCode).toBe(404);
      expect(response.headers["cache-control"]).toBe(NOT_FOUND_READ);
    },
  );
});

describe("GET /categories/:category/:slug", () => {
  it("lists a subcategory under its parent", async () => {
    const response = await get("/categories/youth/arts");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      category: {
        slug: "arts",
        url: "/youth/arts",
        title: "Arts",
        description: null,
      },
      parent: {
        slug: "youth",
        url: "/youth",
        title: "Youth",
        description: null,
      },
      subcategories: [],
      pages: [
        {
          url: "/youth/arts/canvas",
          title: "Canvas",
          description: null,
          digital: true,
        },
      ],
    });
  });

  it("404s a subcategory under the wrong parent", async () => {
    expect((await get("/categories/money/arts")).statusCode).toBe(404);
  });
});

describe("GET /catalog", () => {
  it("lists every public page, sub-pages too, start steps not", async () => {
    const response = await get("/catalog");

    expect(response.statusCode).toBe(200);
    expect(response.json().pages).toEqual([
      {
        url: "/money/apply/notes",
        title: "About grants",
        description: null,
        digital: false,
        stage: null,
      },
      {
        url: "/money/apply",
        title: "Apply for a grant",
        description: null,
        digital: true,
        stage: "alpha",
      },
      {
        url: "/money/budget",
        title: "Budget guide",
        description: null,
        digital: false,
        stage: null,
      },
      {
        url: "/youth/arts/canvas",
        title: "Canvas",
        description: null,
        digital: true,
        stage: null,
      },
    ]);
  });
});

describe("GET /search/documents", () => {
  it("gives each catalog page its keywords and its text in chunks", async () => {
    const response = await get("/search/documents");

    expect(response.statusCode).toBe(200);
    const documents = response.json().documents;
    expect(documents.map((doc: { url: string }) => doc.url)).toEqual([
      "/money/apply/notes",
      "/money/apply",
      "/money/budget",
      "/youth/arts/canvas",
    ]);
    expect(documents[1]).toEqual({
      url: "/money/apply",
      title: "Apply for a grant",
      description: null,
      digital: true,
      keywords: ["grant", "money"],
      chunks: [
        { heading: null, body: "Who can apply." },
        { heading: "Fees", body: "It is free." },
      ],
    });
  });
});

describe("the preview token", () => {
  it("adds preview pages, uncached and without an ETag", async () => {
    const response = await get("/categories/money", SECRET);

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe(EDITOR_READ);
    expect(response.headers.etag).toBeUndefined();
    expect(
      response.json().pages.map((page: { url: string }) => page.url),
    ).toEqual(["/money/apply", "/money/budget", "/money/draft-idea"]);
  });

  it("serves a preview page by url", async () => {
    expect((await get("/pages?url=/money/draft-idea")).statusCode).toBe(404);
    expect((await get("/pages?url=/money/draft-idea", SECRET)).statusCode).toBe(
      200,
    );
  });

  it.each([
    "/categories",
    "/categories/money",
    "/catalog",
    "/search/documents",
    "/pages?url=/money/apply",
  ])(
    "401s a wrong token on %s rather than serving the public view",
    async (url) => {
      const response = await get(url, "wrong");

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "invalid_preview_token" });
      expect(response.headers["cache-control"]).toBe(EDITOR_READ);
    },
  );

  it("401s any token when no preview secret is configured", async () => {
    const bare = await createTestApp(test.db);
    const response = await bare.inject({
      url: "/categories",
      headers: { "x-preview-token": SECRET },
    });

    expect(response.statusCode).toBe(401);
    await bare.close();
  });
});
