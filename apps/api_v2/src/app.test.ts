/**
 * GET /pages?url= row by row against the table it is specified by — 400,
 * 301, the two 404s, and the 200 with its Start link removed when it leads
 * nowhere public — plus the editor's writes and the behaviours it depends
 * on: optimistic concurrency, a 422 per field, and published_at.
 *
 * `app.inject` rather than a live socket: Fastify dispatches the real router,
 * the real handlers and the real error handler, against a real database.
 */

import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Element, Root } from "hast";
import { buildApp, IF_UPDATED_AT, PUBLIC_READ } from "./app";
import { categories, forms, type Visibility } from "./schema";
import { aPage, createTestDb } from "./test-db";
import { ApiStore, type Database } from "./store";

let app: FastifyInstance;
let db: Database;
let close: () => Promise<void>;
let store: ApiStore;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  store = new ApiStore(db);
  app = await buildApp({ db });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await close();
});

const seedPage = async (overrides: Record<string, unknown> = {}) =>
  await store.create(aPage(overrides));

const seedForm = async (formId: string, visibility: Visibility) =>
  await db.insert(forms).values({ formId, visibility });

const seedCategory = async () =>
  (
    await db
      .insert(categories)
      .values({
        slug: "money-financial-support",
        title: "Money and financial support",
      })
      .returning()
  )[0];

const read = (url: string) =>
  app.inject({ url: `/pages?url=${encodeURIComponent(url)}` });

/** Every start link left in a tree. */
const startLinks = (tree: Root): Element[] => {
  const found: Element[] = [];
  const walk = (nodes: Root["children"]) => {
    for (const node of nodes) {
      if (node.type !== "element") continue;
      if (node.tagName === "a" && node.properties.dataStartLink !== undefined) {
        found.push(node);
      }
      walk(node.children as Root["children"]);
    }
  };
  walk(tree.children);
  return found;
};

const ENTRY = "/money-financial-support/calculate-severance-pay";
const START = `${ENTRY}/start`;

const ENTRY_MARKDOWN = [
  "There are 2 ways to apply. You can:",
  "",
  `- apply online: <a data-start-link href="${START}">Start now</a>`,
  "- apply by post",
].join("\n");

describe("GET /pages?url=", () => {
  it("400s when url is missing", async () => {
    const response = await app.inject({ url: "/pages" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "bad_request" });
  });

  it("400s when url is empty", async () => {
    const response = await app.inject({ url: "/pages?url=" });
    expect(response.statusCode).toBe(400);
  });

  it("serves the page as url, frontmatter, hast and breadcrumbs", async () => {
    const category = await seedCategory();
    await seedPage({
      category_id: category.id,
      description: "Estimate what you are owed.",
      frontmatter: { stage: "alpha", keywords: ["redundancy pay"] },
      body_markdown: "## How long does it take?\n\nAbout 3 minutes.",
    });

    const response = await read(ENTRY);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      url: ENTRY,
      frontmatter: {
        title: "Find out how much severance payment you are owed",
        description: "Estimate what you are owed.",
        stage: "alpha",
        keywords: ["redundancy pay"],
      },
      hast: {
        type: "root",
        children: [
          {
            type: "element",
            tagName: "h2",
            properties: {},
            children: [{ type: "text", value: "How long does it take?" }],
          },
          { type: "text", value: "\n" },
          {
            type: "element",
            tagName: "p",
            properties: {},
            children: [{ type: "text", value: "About 3 minutes." }],
          },
        ],
      },
      breadcrumbs: [
        {
          name: "Money and financial support",
          url: "/money-financial-support",
        },
        {
          name: "Find out how much severance payment you are owed",
          url: ENTRY,
        },
      ],
    });
  });

  it("names each crumb from the page filed at that level", async () => {
    await seedCategory();
    await seedPage();
    await seedPage({ url: START, title: "Before you start" });

    const response = await read(START);

    expect(response.json().breadcrumbs).toEqual([
      { name: "Money and financial support", url: "/money-financial-support" },
      { name: "Find out how much severance payment you are owed", url: ENTRY },
      { name: "Before you start", url: START },
    ]);
  });

  it("sanitises the markdown's raw HTML on the way in", async () => {
    await seedPage({
      body_markdown: '<script>alert(1)</script>\n\n<p onclick="x()">Hi</p>',
    });

    const hast = JSON.stringify((await read(ENTRY)).json().hast);

    expect(hast).not.toContain("script");
    expect(hast).not.toContain("onclick");
    expect(hast).toContain("Hi");
  });

  it("301s a bare slug to the one public page it names", async () => {
    await seedPage();

    const response = await read("/calculate-severance-pay");

    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe(ENTRY);
    expect(response.json()).toEqual({ redirect: ENTRY });
  });

  it("404s a bare slug whose page is not public, rather than revealing it", async () => {
    await seedPage({ visibility: "preview" });
    expect((await read("/calculate-severance-pay")).statusCode).toBe(404);
  });

  it("404s a bare slug more than one page shares", async () => {
    await seedPage({ url: "/a/start" });
    await seedPage({ url: "/b/start" });
    expect((await read("/start")).statusCode).toBe(404);
  });

  it("404s a url nothing is filed under, with JSON and no stack trace", async () => {
    const response = await read("/nope/nothing");

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "not_found",
      message: "No page at /nope/nothing",
    });
  });

  it.each(["preview", "draft"])("404s a %s page", async (visibility) => {
    await seedPage({ visibility });
    expect((await read(ENTRY)).statusCode).toBe(404);
  });

  it("404s a public page under a page that is not", async () => {
    // Effective visibility: hiding a service hides its sub-pages.
    await seedPage({ visibility: "draft" });
    await seedPage({ url: START });
    expect((await read(START)).statusCode).toBe(404);
  });

  it.each(["preview", "draft"])(
    "404s a /start page whose form is %s",
    async (visibility) => {
      await seedForm("severance", visibility as Visibility);
      await seedPage({ url: START, form_id: "severance" });
      expect((await read(START)).statusCode).toBe(404);
    },
  );

  it("serves a /start page whose form is public, its button stamped with the form", async () => {
    await seedForm("severance", "public");
    await seedPage({
      url: START,
      form_id: "severance",
      body_markdown: "<a data-start-link>Start now</a>",
    });

    const response = await read(START);

    expect(response.statusCode).toBe(200);
    expect(startLinks(response.json().hast)[0]?.properties).toMatchObject({
      dataFormId: "severance",
    });
  });

  it("keeps the Start link when the /start page and its form are public", async () => {
    await seedForm("severance", "public");
    await seedPage({ form_id: "severance", body_markdown: ENTRY_MARKDOWN });
    await seedPage({ url: START, form_id: "severance" });

    const hast = (await read(ENTRY)).json().hast;

    expect(startLinks(hast)).toHaveLength(1);
    expect(JSON.stringify(hast)).toContain("There are 2 ways to apply.");
  });

  it("removes the Start link, and counts the ways down, when the /start page is hidden", async () => {
    await seedForm("severance", "public");
    await seedPage({ form_id: "severance", body_markdown: ENTRY_MARKDOWN });
    await seedPage({ url: START, form_id: "severance", visibility: "preview" });

    const hast = (await read(ENTRY)).json().hast;

    expect(startLinks(hast)).toHaveLength(0);
    expect(JSON.stringify(hast)).toContain("There is 1 way to apply.");
    expect(JSON.stringify(hast)).toContain("apply by post");
  });

  it("removes the Start link when the form is hidden", async () => {
    await seedForm("severance", "preview");
    await seedPage({ form_id: "severance", body_markdown: ENTRY_MARKDOWN });
    await seedPage({ url: START, form_id: "severance" });

    expect(startLinks((await read(ENTRY)).json().hast)).toHaveLength(0);
  });

  it("sends PUBLIC_READ, on a redirect as on a page", async () => {
    await seedPage();

    expect((await read(ENTRY)).headers["cache-control"]).toBe(PUBLIC_READ);
    expect(
      (await read("/calculate-severance-pay")).headers["cache-control"],
    ).toBe(PUBLIC_READ);
  });
});

describe("GET /pages/:id", () => {
  it("returns the page with its markdown, whatever its visibility", async () => {
    const created = await seedPage({ visibility: "draft" });
    const response = await app.inject({ url: `/pages/${created.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      slug: "calculate-severance-pay",
      visibility: "draft",
      body_markdown: "You should complete the calculator in one go.",
      published_at: null,
    });
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("404s with a JSON body, not a stack trace", async () => {
    const response = await app.inject({
      url: "/pages/22222222-2222-4222-8222-222222222222",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "not_found" });
    expect(response.body).not.toContain("at ");
  });
});

describe("POST /pages", () => {
  it("creates the page and compiles its markdown", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/pages",
      payload: aPage({ body_markdown: "Hello **there**" }),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().published_at).not.toBeNull();
    expect(JSON.stringify((await read(ENTRY)).json().hast)).toContain("strong");
  });

  it("422s an unknown form id, naming the field", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/pages",
      payload: aPage({ form_id: "no-such-form" }),
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: "validation_failed",
      errors: [{ field: "form_id" }],
    });
  });

  it("422s a url another page already has", async () => {
    await seedPage();
    const response = await app.inject({
      method: "POST",
      url: "/pages",
      payload: aPage(),
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().errors).toEqual([
      { field: "url", message: "Another page already has this url." },
    ]);
  });

  it("400s a page with no title", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/pages",
      payload: aPage({ title: undefined }),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("PUT /pages/:id", () => {
  it("saves and returns the new updated_at", async () => {
    const created = await seedPage();
    const response = await app.inject({
      method: "PUT",
      url: `/pages/${created.id}`,
      headers: { [IF_UPDATED_AT]: created.updated_at },
      payload: { ...created, title: "Severance pay" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().title).toBe("Severance pay");
    expect(response.json().updated_at).not.toBe(created.updated_at);
  });

  it("409s on a stale if-updated-at and leaves the row untouched", async () => {
    const created = await seedPage();
    await app.inject({
      method: "PUT",
      url: `/pages/${created.id}`,
      headers: { [IF_UPDATED_AT]: created.updated_at },
      payload: { ...created, title: "First writer wins" },
    });

    const response = await app.inject({
      method: "PUT",
      url: `/pages/${created.id}`,
      headers: { [IF_UPDATED_AT]: created.updated_at },
      payload: { ...created, title: "Second writer clobbers" },
    });

    expect(response.statusCode).toBe(409);
    expect((await store.get(created.id))?.title).toBe("First writer wins");
  });

  it("404s a page that is not there", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/pages/22222222-2222-4222-8222-222222222222",
      payload: aPage(),
    });
    expect(response.statusCode).toBe(404);
  });

  it("stamps published_at the first time a page goes public, and never moves it", async () => {
    const draft = await seedPage({ visibility: "draft" });
    const put = async (current: typeof draft, visibility: Visibility) =>
      (
        await app.inject({
          method: "PUT",
          url: `/pages/${draft.id}`,
          payload: { ...current, visibility },
        })
      ).json();

    const published = await put(draft, "public");
    const hidden = await put(published, "preview");
    const again = await put(hidden, "public");

    expect(published.published_at).not.toBeNull();
    expect(hidden.published_at).toBe(published.published_at);
    expect(again.published_at).toBe(published.published_at);

    const actions = await db.execute(
      sql`select action from change_events order by version_no`,
    );
    const rows = Array.isArray(actions) ? actions : actions.rows;
    expect(rows.map((row: { action: string }) => row.action)).toEqual([
      "created",
      "published",
      "updated",
      "updated",
    ]);
  });
});

describe("DELETE /pages/:id", () => {
  it("removes the page", async () => {
    const created = await seedPage();
    const response = await app.inject({
      method: "DELETE",
      url: `/pages/${created.id}`,
    });

    expect(response.statusCode).toBe(204);
    expect(await store.get(created.id)).toBeNull();
  });
});

describe("Cache-Control", () => {
  it("answers a matching If-None-Match with 304, carrying the same Cache-Control", async () => {
    await seedPage();
    const first = await read(ENTRY);
    const etag = first.headers.etag as string;

    const second = await app.inject({
      url: `/pages?url=${encodeURIComponent(ENTRY)}`,
      headers: { "if-none-match": etag },
    });

    expect(second.statusCode).toBe(304);
    expect(second.headers["cache-control"]).toBe(PUBLIC_READ);
  });

  // A route must only advertise a policy for the response it actually sent —
  // a 500 must not carry PUBLIC_READ just because the handler set it before
  // the store call that then failed.
  it("sends no Cache-Control on a genuine store failure", async () => {
    const brokenApp = await buildApp({ db: {} as Database });
    await brokenApp.ready();

    const response = await brokenApp.inject({ url: "/pages?url=/x" });

    expect(response.statusCode).toBe(500);
    expect(response.headers["cache-control"]).toBeUndefined();

    await brokenApp.close();
  });
});

describe("timestamp precision", () => {
  /**
   * `updated_at` has to survive the round trip through JSON exactly, or
   * optimistic concurrency rejects every save. Postgres stores microseconds
   * and `toISOString()` emits milliseconds, so the column is `timestamptz(3)`
   * — this asserts the agreement rather than trusting it.
   */
  it("round-trips updated_at through JSON without losing precision", async () => {
    const created = await seedPage();
    const fetched = (await app.inject({ url: `/pages/${created.id}` })).json();

    expect(fetched.updated_at).toBe(created.updated_at);
    expect(fetched.updated_at).toMatch(/\.\d{3}Z$/);
  });

  it("accepts the updated_at it just handed out, twice in a row", async () => {
    const created = await seedPage();

    let current = created;
    for (const title of ["First edit", "Second edit"]) {
      const response = await app.inject({
        method: "PUT",
        url: `/pages/${current.id}`,
        headers: { [IF_UPDATED_AT]: current.updated_at },
        payload: { ...current, title },
      });
      expect(response.statusCode).toBe(200);
      current = response.json();
    }

    expect(current.title).toBe("Second edit");
  });
});

describe("CORS", () => {
  /**
   * Writes are unauthenticated until #2701, so the origin allow-list is the
   * only thing standing between a developer's running instance and any page
   * they happen to have open. These assert the boundary rather than assuming
   * the defaults are safe — the defaults are what made it reachable.
   */
  it("lets the dev server preflight a write", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/pages/x",
      headers: {
        origin: "http://localhost:3010",
        "access-control-request-method": "PUT",
      },
    });

    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3010",
    );
    expect(String(response.headers["access-control-allow-methods"])).toContain(
      "DELETE",
    );
  });

  it("refuses landing_v2's origin, now that every fetch is server-side", async () => {
    // Assumption (#2702): landing_v2 fetches api_v2 from its own server, not
    // the browser, so its origin never meets CORS and came out of the
    // default allow-list.
    const response = await app.inject({
      method: "GET",
      url: "/pages?url=/x",
      headers: { origin: "http://localhost:3030" },
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("refuses to hand an unknown site permission to write", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/pages/x",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "DELETE",
      },
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("still serves a request with no Origin at all", async () => {
    // curl, a health check, the tests themselves.
    const created = await seedPage();
    const response = await app.inject({ url: `/pages/${created.id}` });
    expect(response.statusCode).toBe(200);
  });
});
