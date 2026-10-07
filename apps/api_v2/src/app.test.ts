/**
 * GET /pages?url= row by row against the table it is specified by — 400,
 * 301, the two 404s, and the 200 with its Start link flagged hidden when its
 * `start` sub-page is — the site's category, catalog and search reads, with
 * and without the preview token, plus the editor's writes and the behaviours
 * they depend on: optimistic concurrency, a 422 per field, and published_at.
 *
 * `app.inject` rather than a live socket: Fastify dispatches the real router,
 * the real handlers and the real error handler, against a real database.
 */

import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import pino from "pino";
import { IF_UPDATED_AT } from "./routes/pages";
import { PUBLIC_READ } from "./routes/responses";
import type { Database } from "./db";
import { withDefaults, type Visibility } from "./modules/page";
import { categories, changeEvents, searchChunks } from "./schema";
import {
  aPage,
  createTestApp,
  createTestDb,
  createTestServices,
  expectOk,
  TEST_EMPLOYEE,
  TEST_HEADERS,
  TEST_HTTP_CONFIG,
} from "./test-db";
import { AuthUnavailable, Forbidden } from "./modules/auth";
import { Redacted } from "./modules/redacted";
import { err, ok } from "./modules/result";

let app: FastifyInstance;
let db: Database;
let close: () => Promise<void>;
let services: ReturnType<typeof createTestServices>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  services = createTestServices(db);
  app = await createTestApp(db);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await close();
});

const inject = (options: InjectOptions) =>
  app.inject({ ...options, headers: { ...TEST_HEADERS, ...options.headers } });

const seedPage = async (overrides: Record<string, unknown> = {}) =>
  expectOk(await services.editing.create(aPage(overrides), TEST_EMPLOYEE));

const seedCategory = async () => {
  const [category] = await db
    .insert(categories)
    .values({
      slug: "money-financial-support",
      title: "Money and financial support",
    })
    .returning();
  if (!category) throw new Error("The category insert returned no row");
  return category;
};

const read = (url: string) =>
  inject({ url: `/pages?url=${encodeURIComponent(url)}` });

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
    const response = await inject({ url: "/pages" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "bad_request" });
  });

  it("400s when url is empty", async () => {
    const response = await inject({ url: "/pages?url=" });
    expect(response.statusCode).toBe(400);
  });

  it("serves the page as url, frontmatter, markdown and breadcrumbs", async () => {
    const category = await seedCategory();
    const created = await seedPage({
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
      body_markdown: "## How long does it take?\n\nAbout 3 minutes.",
      form_id: null,
      hide_start_links: false,
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
      published_at: created.published_at,
      updated_at: created.updated_at,
    });
  });

  it("dates a page that has never been public with a null published_at", async () => {
    const created = await seedPage({ visibility: "preview" });
    const app = await createTestApp(db, {
      previewSecret: new Redacted("secret"),
    });

    const response = await app.inject({
      url: `/pages?url=${ENTRY}`,
      headers: { "x-preview-token": "secret" },
    });

    expect(response.json()).toMatchObject({
      published_at: null,
      updated_at: created.updated_at,
    });
    await app.close();
  });

  it("names a crumb for each page above it, by parent rather than by url", async () => {
    // The pharmacy pages sit beside their parent in the url but beneath it in
    // the hierarchy; the trail follows the hierarchy.
    const category = await seedCategory();
    const parent = await seedPage({ category_id: category.id });
    const child = "/money-financial-support/severance-explained";
    await seedPage({
      url: child,
      title: "Severance explained",
      category_id: category.id,
      parent_id: parent.id,
    });

    const response = await read(child);

    expect(response.json().breadcrumbs).toEqual([
      { name: "Money and financial support", url: "/money-financial-support" },
      { name: "Find out how much severance payment you are owed", url: ENTRY },
      { name: "Severance explained", url: child },
    ]);
  });

  it("names the parent category before a subcategory", async () => {
    const parent = await seedCategory();
    const [sub] = await db
      .insert(categories)
      .values({ slug: "arts-culture", title: "Arts", parentId: parent.id })
      .returning();
    if (!sub) throw new Error("The subcategory was not inserted");
    const url = "/money-financial-support/arts-culture/canvas";
    await seedPage({ url, title: "Canvas", category_id: sub.id });

    expect((await read(url)).json().breadcrumbs).toEqual([
      { name: "Money and financial support", url: "/money-financial-support" },
      { name: "Arts", url: "/money-financial-support/arts-culture" },
      { name: "Canvas", url },
    ]);
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

  it("404s a public page beneath a page that is not", async () => {
    // Effective visibility: hiding a service hides its sub-pages, wherever
    // their urls are.
    const parent = await seedPage({ visibility: "draft" });
    await seedPage({ url: "/elsewhere", parent_id: parent.id });
    expect((await read("/elsewhere")).statusCode).toBe(404);
  });

  it("serves a public page whose url sits under a hidden page it is not beneath", async () => {
    // The url is only an address; the hierarchy is parent_id.
    await seedPage({ visibility: "draft" });
    await seedPage({ url: `${ENTRY}/notes` });
    expect((await read(`${ENTRY}/notes`)).statusCode).toBe(200);
  });

  it("serves a start page naming its form, whatever the form's status", async () => {
    // Whether the form is open is the forms API's to say, not this one's.
    const parent = await seedPage();
    await seedPage({
      url: START,
      parent_id: parent.id,
      form_id: "severance",
      body_markdown: "<a data-start-link>Start now</a>",
    });

    const response = await read(START);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      form_id: "severance",
      hide_start_links: false,
    });
  });

  it("keeps the Start link when the start sub-page is public", async () => {
    const parent = await seedPage({ body_markdown: ENTRY_MARKDOWN });
    await seedPage({ url: START, parent_id: parent.id });

    expect((await read(ENTRY)).json().hide_start_links).toBe(false);
  });

  it("hides the Start link when the start sub-page is hidden", async () => {
    const parent = await seedPage({ body_markdown: ENTRY_MARKDOWN });
    await seedPage({ url: START, parent_id: parent.id, visibility: "preview" });

    expect((await read(ENTRY)).json().hide_start_links).toBe(true);
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
    const response = await inject({ url: `/pages/${created.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      slug: "calculate-severance-pay",
      visibility: "draft",
      body_markdown: "You should complete the calculator in one go.",
      published_at: null,
    });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("400s an id that is not a UUID instead of asking the database", async () => {
    const response = await inject({ url: "/pages/not-a-uuid" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "bad_request" });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("404s with a JSON body, not a stack trace", async () => {
    const response = await inject({
      url: "/pages/22222222-2222-4222-8222-222222222222",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "not_found" });
    expect(response.body).not.toContain("at ");
  });
});

describe("GET /services", () => {
  it("groups each entry page with the pages below it, ordered by title", async () => {
    const category = await seedCategory();
    const entry = await seedPage({ category_id: category.id });
    const start = await seedPage({
      category_id: category.id,
      url: START,
      parent_id: entry.id,
      form_id: "severance-pay",
    });
    // Below the start page, and at a url outside the service's: the group
    // follows parent_id all the way down, not the url.
    const supporting = await seedPage({
      category_id: category.id,
      url: "/money-financial-support/how-severance-is-worked-out",
      parent_id: start.id,
      title: "How severance pay is worked out",
    });
    await seedPage({
      category_id: category.id,
      url: "/money-financial-support/apply-for-a-grant",
      title: "Apply for a grant",
      visibility: "draft",
    });
    await seedPage({ url: "/terms-conditions", title: "Terms and conditions" });

    const response = await inject({ url: "/services" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const services = response.json();
    expect(services).toMatchObject([
      {
        url: "/money-financial-support/apply-for-a-grant",
        visibility: "draft",
        form_id: null,
        has_start_page: false,
        page_count: 1,
      },
      {
        url: ENTRY,
        title: "Find out how much severance payment you are owed",
        category: {
          slug: "money-financial-support",
          title: "Money and financial support",
        },
        visibility: "public",
        form_id: "severance-pay",
        has_start_page: true,
        page_count: 3,
        updated_at: supporting.updated_at,
      },
    ]);
    expect(services).toHaveLength(2);
  });
});

describe("POST /pages", () => {
  it("creates the page", async () => {
    const response = await inject({
      method: "POST",
      url: "/pages",
      payload: aPage({ body_markdown: "Hello **there**" }),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().published_at).not.toBeNull();
    expect((await read(ENTRY)).json().body_markdown).toBe("Hello **there**");
  });

  it("422s an unknown parent, naming the field", async () => {
    const response = await inject({
      method: "POST",
      url: "/pages",
      payload: aPage({ parent_id: "22222222-2222-4222-8222-222222222222" }),
    });

    expect(response.statusCode).toBe(422);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({
      error: "validation_failed",
      errors: [{ field: "parent_id", message: "No page with that id." }],
    });
  });

  it("422s a sub-page in a different category from its parent", async () => {
    const category = await seedCategory();
    const parent = await seedPage();
    const response = await inject({
      method: "POST",
      url: "/pages",
      payload: aPage({
        url: "/x",
        parent_id: parent.id,
        category_id: category.id,
      }),
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().errors).toEqual([
      {
        field: "parent_id",
        message: "A sub-page must be in the same category as its parent page.",
      },
    ]);
  });

  it("takes any form id: form status is the forms API's", async () => {
    const response = await inject({
      method: "POST",
      url: "/pages",
      payload: aPage({ form_id: "any-form" }),
    });

    expect(response.statusCode).toBe(201);
  });

  it("422s a url another page already has", async () => {
    await seedPage();
    const response = await inject({
      method: "POST",
      url: "/pages",
      payload: aPage(),
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().errors).toEqual([
      { field: "url", message: "Another page already has this url." },
    ]);
  });

  it("422s an id another page already has, naming the id", async () => {
    const existing = await seedPage();
    const response = await inject({
      method: "POST",
      url: "/pages",
      payload: aPage({ id: existing.id, url: "/somewhere-else" }),
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().errors).toEqual([
      { field: "id", message: "Another page already has this id." },
    ]);
  });

  it("400s a page with no title", async () => {
    const response = await inject({
      method: "POST",
      url: "/pages",
      payload: aPage({ title: undefined }),
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});

describe("PUT /pages/:id", () => {
  it("saves and returns the new updated_at", async () => {
    const created = await seedPage();
    const response = await inject({
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
    await inject({
      method: "PUT",
      url: `/pages/${created.id}`,
      headers: { [IF_UPDATED_AT]: created.updated_at },
      payload: { ...created, title: "First writer wins" },
    });

    const response = await inject({
      method: "PUT",
      url: `/pages/${created.id}`,
      headers: { [IF_UPDATED_AT]: created.updated_at },
      payload: { ...created, title: "Second writer clobbers" },
    });

    expect(response.statusCode).toBe(409);
    expect(expectOk(await services.editing.get(created.id))?.title).toBe(
      "First writer wins",
    );
  });

  it("400s a save that leaves a field out, rather than resetting it", async () => {
    const created = await seedPage({ form_id: "severance-calculator" });
    const { form_id, ...partial } = created;

    const response = await inject({
      method: "PUT",
      url: `/pages/${created.id}`,
      payload: partial,
    });

    expect(response.statusCode).toBe(400);
    expect(expectOk(await services.editing.get(created.id))?.form_id).toBe(
      "severance-calculator",
    );
  });

  it("400s an if-updated-at that is not a timestamp, rather than saving unconditionally", async () => {
    const created = await seedPage();
    const response = await inject({
      method: "PUT",
      url: `/pages/${created.id}`,
      headers: { [IF_UPDATED_AT]: "yesterday" },
      payload: { ...created, title: "Saved by accident" },
    });

    expect(response.statusCode).toBe(400);
    expect(expectOk(await services.editing.get(created.id))?.title).toBe(
      created.title,
    );
  });

  it("404s a page that is not there", async () => {
    const response = await inject({
      method: "PUT",
      url: "/pages/22222222-2222-4222-8222-222222222222",
      payload: withDefaults(aPage()),
    });
    expect(response.statusCode).toBe(404);
  });

  it("stamps published_at the first time a page goes public, and never moves it", async () => {
    const draft = await seedPage({ visibility: "draft" });
    const put = async (current: typeof draft, visibility: Visibility) =>
      (
        await inject({
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

    const rows = await db
      .select({ action: changeEvents.action })
      .from(changeEvents)
      .orderBy(changeEvents.versionNo);
    expect(rows.map((row) => row.action)).toEqual([
      "created",
      "published",
      "updated",
      "updated",
    ]);
  });

  it("422s a page placed beneath its own sub-page", async () => {
    const parent = await seedPage();
    const child = await seedPage({ url: START, parent_id: parent.id });

    const response = await inject({
      method: "PUT",
      url: `/pages/${parent.id}`,
      payload: { ...parent, parent_id: child.id },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().errors).toEqual([
      { field: "parent_id", message: "A page cannot be its own sub-page." },
    ]);
  });

  it("keeps the parent when a save leaves parent_id out", async () => {
    // PUT replaces the page, but a client that does not know about the
    // hierarchy must not detach a sub-page (and so publish it) by omission.
    const parent = await seedPage({ visibility: "draft" });
    const child = await seedPage({ url: START, parent_id: parent.id });
    const { parent_id, ...unplaced } = child;

    const response = await inject({
      method: "PUT",
      url: `/pages/${child.id}`,
      payload: { ...unplaced, title: "Renamed" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().parent_id).toBe(parent.id);
    expect((await read(START)).statusCode).toBe(404);
  });

  it("files a sub-page under its parent's category when it names none", async () => {
    const category = await seedCategory();
    const parent = await seedPage({ category_id: category.id });

    const response = await inject({
      method: "POST",
      url: "/pages",
      payload: aPage({ url: START, parent_id: parent.id }),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().category_id).toBe(category.id);
  });

  it("answers for a page whose parents loop, rather than recursing forever", async () => {
    // Belt and braces: writes refuse cycles, but a read must still end if
    // one ever got in.
    const a = await seedPage({ url: "/a" });
    const b = await seedPage({ url: "/b", parent_id: a.id });
    await seedPage({ url: "/c", parent_id: b.id });
    await db.execute(
      sql`update content_pages set parent_id = ${b.id} where id = ${a.id}`,
    );

    expect((await read("/c")).statusCode).toBe(200);
  });

  it("moves sub-pages, all the way down, when their parent changes category", async () => {
    const from = await seedCategory();
    const [to] = await db
      .insert(categories)
      .values({ slug: "work-employment", title: "Work" })
      .returning();
    if (!to) throw new Error("The category was not inserted");
    const parent = await seedPage({ category_id: from.id });
    const start = await seedPage({ url: START, parent_id: parent.id });
    const below = await seedPage({ url: `${START}/more`, parent_id: start.id });

    const response = await inject({
      method: "PUT",
      url: `/pages/${parent.id}`,
      payload: { ...parent, category_id: to.id },
    });

    expect(response.statusCode).toBe(200);
    expect(expectOk(await services.editing.get(start.id))?.category_id).toBe(
      to.id,
    );
    expect(expectOk(await services.editing.get(below.id))?.category_id).toBe(
      to.id,
    );
  });

  it("files an uncategorised parent's sub-pages when it gets a category", async () => {
    // The composite key skips rows whose category is null, so this case is
    // the store's to carry, not the cascade's.
    const category = await seedCategory();
    const parent = await seedPage();
    const start = await seedPage({ url: START, parent_id: parent.id });
    const below = await seedPage({ url: `${START}/more`, parent_id: start.id });

    await inject({
      method: "PUT",
      url: `/pages/${parent.id}`,
      payload: { ...parent, category_id: category.id },
    });

    expect(expectOk(await services.editing.get(start.id))?.category_id).toBe(
      category.id,
    );
    expect(expectOk(await services.editing.get(below.id))?.category_id).toBe(
      category.id,
    );
    expect((await read(START)).json().breadcrumbs[0]).toEqual({
      name: "Money and financial support",
      url: "/money-financial-support",
    });
  });

  it("re-cuts the page's search chunks from the saved body", async () => {
    const created = await seedPage({ body_markdown: "Old text" });
    await inject({
      method: "PUT",
      url: `/pages/${created.id}`,
      payload: { ...created, body_markdown: "Intro\n\n## Fees\n\nTen dollars" },
    });

    const rows = await db
      .select({ heading: searchChunks.heading, body: searchChunks.body })
      .from(searchChunks)
      .orderBy(searchChunks.ordinal);
    expect(rows).toEqual([
      { heading: null, body: "Intro" },
      { heading: "Fees", body: "Ten dollars" },
    ]);
  });
});

describe("DELETE /pages/:id", () => {
  it("removes the page", async () => {
    const created = await seedPage();
    const response = await inject({
      method: "DELETE",
      url: `/pages/${created.id}`,
    });

    expect(response.statusCode).toBe(204);
    expect(expectOk(await services.editing.get(created.id))).toBeNull();
  });

  it("records who deleted the page, which moves the version", async () => {
    const created = await seedPage();
    await inject({ method: "DELETE", url: `/pages/${created.id}` });

    const events = await db
      .select({ action: changeEvents.action, actor: changeEvents.actor })
      .from(changeEvents)
      .orderBy(changeEvents.versionNo);
    expect(events).toEqual([
      { action: "created", actor: TEST_EMPLOYEE.id },
      { action: "deleted", actor: TEST_EMPLOYEE.id },
    ]);
    expect(expectOk(await services.index.version()).count).toBe(2);
  });

  it("422s a page that still has sub-pages, and keeps it", async () => {
    const parent = await seedPage();
    await seedPage({ url: START, parent_id: parent.id });

    const response = await inject({
      method: "DELETE",
      url: `/pages/${parent.id}`,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().errors[0].field).toBe("id");
    expect(expectOk(await services.editing.get(parent.id))).not.toBeNull();
  });
});

describe("client errors", () => {
  it("400s a body that is not valid JSON", async () => {
    const response = await inject({
      method: "POST",
      url: "/pages",
      headers: { "content-type": "application/json" },
      payload: "{",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("bad_request");
  });

  it("415s a body that is not JSON at all", async () => {
    const response = await inject({
      method: "POST",
      url: "/pages",
      headers: { "content-type": "text/csv" },
      payload: "url,title",
    });
    expect(response.statusCode).toBe(415);
    expect(response.json().error).toBe("unsupported_media_type");
  });

  it.each([
    ["a title over 300 characters", { title: "x".repeat(301) }],
    ["a url over 512 characters", { url: `/${"x".repeat(512)}/pay` }],
  ])("400s a page with %s", async (_name, overrides) => {
    const response = await inject({
      method: "POST",
      url: "/pages",
      payload: aPage(overrides),
    });
    expect(response.statusCode).toBe(400);
  });

  it("400s a read of a url over 512 characters", async () => {
    expect((await read(`/${"x".repeat(512)}`)).statusCode).toBe(400);
  });

  it("answers a route that does not exist with a JSON 404", async () => {
    const response = await inject({ url: "/nowhere?x=1" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "not_found",
      message: "No route for GET /nowhere",
    });
  });
});

describe("Cache-Control", () => {
  it("answers a matching If-None-Match with 304, carrying the same Cache-Control", async () => {
    await seedPage();
    const first = await read(ENTRY);
    const etag = first.headers.etag;
    if (typeof etag !== "string") throw new Error("Expected a public ETag");

    const second = await inject({
      url: `/pages?url=${encodeURIComponent(ENTRY)}`,
      headers: { "if-none-match": etag },
    });

    expect(second.statusCode).toBe(304);
    expect(second.headers["cache-control"]).toBe(PUBLIC_READ);
  });

  // #2835: without a policy every hit for an unknown url reached Postgres.
  it("sends a ten-second policy on the public by-url 404", async () => {
    const response = await inject({ url: "/pages?url=/nope" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["cache-control"]).toBe("public, max-age=10");
    expect(response.headers.etag).toBeUndefined();
  });

  it("prevents caching the /pages/:id 404", async () => {
    const byId = await inject({
      url: "/pages/22222222-2222-4222-8222-222222222222",
    });

    expect(byId.statusCode).toBe(404);
    expect(byId.headers["cache-control"]).toBe("no-store");
  });

  // A route must only advertise a policy for the response it actually sent —
  // a 500 must not carry PUBLIC_READ just because the handler set it before
  // the store call that then failed.
  it("sends no Cache-Control on a genuine store failure", async () => {
    const broken = await createTestDb();
    const brokenApp = await createTestApp(broken.db);
    await brokenApp.ready();
    await broken.close();

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
    const fetched = (await inject({ url: `/pages/${created.id}` })).json();

    expect(fetched.updated_at).toBe(created.updated_at);
    expect(fetched.updated_at).toMatch(/\.\d{3}Z$/);
  });

  it("accepts the updated_at it just handed out, twice in a row", async () => {
    const created = await seedPage();

    let current = created;
    for (const title of ["First edit", "Second edit"]) {
      const response = await inject({
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
  it("lets the dev server preflight a write", async () => {
    const response = await inject({
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

  it("refuses a site's origin, since sites fetch from their own server", async () => {
    // Assumption (#2702): the site reads api_v2 from its server, not the
    // browser, so only the editor's origin is on the allow-list.
    const response = await inject({
      method: "GET",
      url: "/pages?url=/x",
      headers: { origin: "http://localhost:3030" },
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("refuses to hand an unknown site permission to write", async () => {
    const response = await inject({
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
    const response = await app.inject({
      url: `/pages/${created.id}`,
      headers: { cookie: TEST_HEADERS.cookie },
    });
    expect(response.statusCode).toBe(200);
  });
});

describe("employee access", () => {
  it.each([
    ["GET", "/pages/not-a-uuid"],
    ["HEAD", "/pages/not-a-uuid"],
    ["GET", "/services"],
    ["GET", "/version"],
    ["POST", "/pages"],
    ["PUT", "/pages/not-a-uuid"],
    ["DELETE", "/pages/not-a-uuid"],
  ] as const)(
    "rejects anonymous %s %s before validation or storage",
    async (method, url) => {
      const response = await app.inject({
        method,
        url,
        headers: { origin: TEST_HTTP_CONFIG.editorOrigin },
      });
      expect(response.statusCode).toBe(401);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers.etag).toBeUndefined();
    },
  );

  it.each([
    ["expired", ok(null), 401],
    ["outside the workspace", err(new Forbidden()), 403],
    ["unavailable", err(new AuthUnavailable()), 503],
  ] as const)(
    "fails closed when the session is %s",
    async (_name, result, status) => {
      const restricted = await createTestApp(db, {
        sessions: { findSession: async () => result },
      });
      try {
        const response = await restricted.inject({
          url: "/version",
          headers: TEST_HEADERS,
        });
        expect(response.statusCode).toBe(status);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.headers.etag).toBeUndefined();
      } finally {
        await restricted.close();
      }
    },
  );

  it.each([undefined, "null", "https://evil.example"])(
    "rejects a write from origin %s even with a session",
    async (origin) => {
      for (const method of ["POST", "PUT", "DELETE"] as const) {
        const response = await app.inject({
          method,
          url: method === "POST" ? "/pages" : "/pages/not-a-uuid",
          payload: aPage(),
          headers: {
            cookie: TEST_HEADERS.cookie,
            ...(origin === undefined ? {} : { origin }),
          },
        });
        expect(response.statusCode).toBe(403);
        expect(response.headers["cache-control"]).toBe("no-store");
      }
      expect(expectOk(await services.index.version())).toEqual({
        count: 0,
        latest: null,
      });
    },
  );

  it("records the authenticated employee on create and save events", async () => {
    const created = await inject({
      method: "POST",
      url: "/pages",
      payload: aPage(),
    });
    expect(created.statusCode).toBe(201);
    const saved = await inject({
      method: "PUT",
      url: `/pages/${created.json().id}`,
      payload: withDefaults(aPage({ title: "Updated" })),
    });
    expect(saved.statusCode).toBe(200);
    const events = await db
      .select({ actor: changeEvents.actor })
      .from(changeEvents);
    expect(events).toEqual([
      { actor: TEST_EMPLOYEE.id },
      { actor: TEST_EMPLOYEE.id },
    ]);
  });

  it("never gives editor reads an ETag or a conditional 304", async () => {
    const page = await seedPage();
    for (const url of [`/pages/${page.id}`, "/version"]) {
      const response = await inject({ url, headers: { "if-none-match": "*" } });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers.etag).toBeUndefined();
    }
  });

  it("keeps public content and documentation available without a session", async () => {
    await seedPage();
    const page = await app.inject({ url: `/pages?url=${ENTRY}` });
    expect(page.statusCode).toBe(200);
    expect(page.headers["cache-control"]).toBe(PUBLIC_READ);
    expect(page.headers.etag).toBeDefined();
    expect((await app.inject({ url: "/docs/openapi.json" })).statusCode).toBe(
      200,
    );
  });
});

describe("authentication HTTP bridge", () => {
  it("keeps callback credentials and adapter error details out of logs", async () => {
    const logs: string[] = [];
    const authApp = await createTestApp(db, {
      logger: pino({ level: "info" }, { write: (line) => logs.push(line) }),
      auth: {
        handle: async () => {
          throw new Error("sensitive-adapter-detail");
        },
      },
    });
    try {
      const response = await authApp.inject({
        url: "/api/auth/callback/github?code=sensitive-code&state=sensitive-state",
        headers: { cookie: "session=sensitive-cookie" },
      });
      expect(response.statusCode).toBe(500);
      const logged = logs.join("\n");
      expect(logged).toContain("request failed");
      expect(logged).toContain("/api/auth/*");
      expect(logged).not.toContain("sensitive-");
    } finally {
      await authApp.close();
    }
  });

  it("uses the configured origin and forwards the body and individual cookies", async () => {
    const received: Request[] = [];
    const authApp = await createTestApp(db, {
      auth: {
        handle: async (request) => {
          received.push(request);
          const headers = new Headers({
            location: "https://github.com/example",
            "cache-control": "public, max-age=60",
          });
          headers.append("set-cookie", "state=one; Path=/; HttpOnly");
          headers.append("set-cookie", "session=two; Path=/; HttpOnly");
          return new Response(null, { status: 302, headers });
        },
      },
    });
    try {
      const response = await authApp.inject({
        method: "POST",
        url: "/api/auth/sign-in/social",
        payload: { provider: "github" },
        headers: { ...TEST_HEADERS, host: "untrusted.example" },
      });
      expect(received).toHaveLength(1);
      const request = received[0];
      if (!request)
        throw new Error("Expected the auth adapter to receive a request");
      expect(request.url).toBe(
        `${TEST_HTTP_CONFIG.apiOrigin}/api/auth/sign-in/social`,
      );
      expect(request.headers.get("cookie")).toBe(TEST_HEADERS.cookie);
      expect(await request.json()).toEqual({ provider: "github" });
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe("https://github.com/example");
      expect(response.headers["set-cookie"]).toEqual([
        "state=one; Path=/; HttpOnly",
        "session=two; Path=/; HttpOnly",
      ]);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers.etag).toBeUndefined();
    } finally {
      await authApp.close();
    }
  });

  it("never caches auth successes or transport failures", async () => {
    let fail = false;
    const authApp = await createTestApp(db, {
      auth: {
        handle: async () => {
          if (fail) throw new Error("sensitive-token-do-not-log");
          return Response.json({ session: null });
        },
      },
    });
    try {
      for (const status of [200, 500]) {
        const response = await authApp.inject({
          url: "/api/auth/get-session",
          headers: { "if-none-match": "*" },
        });
        expect(response.statusCode).toBe(status);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.headers.etag).toBeUndefined();
        fail = true;
      }
    } finally {
      await authApp.close();
    }
  });
});
