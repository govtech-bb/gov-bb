/**
 * GET /pages?url= row by row against the table it is specified by — 400,
 * 301, the two 404s, and the 200 with its Start link flagged hidden when it
 * leads nowhere public — plus the editor's writes and the behaviours it depends
 * on: optimistic concurrency, a 422 per field, and published_at.
 *
 * `app.inject` rather than a live socket: Fastify dispatches the real router,
 * the real handlers and the real error handler, against a real database.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import pino from "pino";
import { IF_UPDATED_AT, PUBLIC_READ } from "./app";
import { categories, changeEvents, forms, type Visibility } from "./schema";
import {
  aPage,
  createTestApp,
  createTestDb,
  TEST_EMPLOYEE,
  TEST_HEADERS,
  TEST_HTTP_CONFIG,
} from "./test-db";
import { AuthUnavailable, Forbidden } from "./modules/auth";
import { err, ok } from "./modules/result";
import { ApiStore, type Database } from "./store";

let app: FastifyInstance;
let db: Database;
let close: () => Promise<void>;
let store: ApiStore;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  store = new ApiStore(db);
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
  await store.create(aPage(overrides), TEST_EMPLOYEE.id);

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

  it.each(["preview", "draft"] as const)(
    "404s a /start page whose form is %s",
    async (visibility) => {
      await seedForm("severance", visibility);
      await seedPage({ url: START, form_id: "severance" });
      expect((await read(START)).statusCode).toBe(404);
    },
  );

  it("serves a /start page whose form is public, naming the form", async () => {
    await seedForm("severance", "public");
    await seedPage({
      url: START,
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

  it("keeps the Start link when the /start page and its form are public", async () => {
    await seedForm("severance", "public");
    await seedPage({ form_id: "severance", body_markdown: ENTRY_MARKDOWN });
    await seedPage({ url: START, form_id: "severance" });

    expect((await read(ENTRY)).json().hide_start_links).toBe(false);
  });

  it("hides the Start link when the /start page is hidden", async () => {
    await seedForm("severance", "public");
    await seedPage({ form_id: "severance", body_markdown: ENTRY_MARKDOWN });
    await seedPage({ url: START, form_id: "severance", visibility: "preview" });

    expect((await read(ENTRY)).json().hide_start_links).toBe(true);
  });

  it("hides the Start link when the form is hidden", async () => {
    await seedForm("severance", "preview");
    await seedPage({ form_id: "severance", body_markdown: ENTRY_MARKDOWN });
    await seedPage({ url: START, form_id: "severance" });

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

  it("404s with a JSON body, not a stack trace", async () => {
    const response = await inject({
      url: "/pages/22222222-2222-4222-8222-222222222222",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "not_found" });
    expect(response.body).not.toContain("at ");
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

  it("422s an unknown form id, naming the field", async () => {
    const response = await inject({
      method: "POST",
      url: "/pages",
      payload: aPage({ form_id: "no-such-form" }),
    });

    expect(response.statusCode).toBe(422);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({
      error: "validation_failed",
      errors: [{ field: "form_id" }],
    });
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
    expect((await store.get(created.id))?.title).toBe("First writer wins");
  });

  it("404s a page that is not there", async () => {
    const response = await inject({
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
});

describe("DELETE /pages/:id", () => {
  it("removes the page", async () => {
    const created = await seedPage();
    const response = await inject({
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

  it("refuses landing_v2's origin, now that every fetch is server-side", async () => {
    // Assumption (#2702): landing_v2 fetches api_v2 from its own server, not
    // the browser, so its origin never meets CORS and came out of the
    // default allow-list.
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
      expect(await store.version()).toEqual({ count: 0, latest: null });
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
      payload: aPage({ title: "Updated" }),
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
    expect((await app.inject({ url: "/openapi.json" })).statusCode).toBe(200);
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
