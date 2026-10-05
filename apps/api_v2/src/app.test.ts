/**
 * One test per endpoint, happy path and 404, per #2700's acceptance criteria
 * — plus the three behaviours the editor already depends on and would break
 * silently without: optimistic concurrency, per-block validation errors, and
 * hrefs refused on ingest.
 *
 * `app.inject` rather than a live socket: Fastify dispatches the real router,
 * the real handlers and the real error handler, against a real database.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp, IF_UPDATED_AT } from "./app";
import { aDocument, createTestDb } from "./test-db";
import { ApiStore, type Database } from "./store";

let app: FastifyInstance;
let db: Database;
let close: () => Promise<void>;
let store: ApiStore;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  store = new ApiStore(db);
  app = await buildApp({ db, openWrites: true });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await close();
});

const seedPage = async (overrides: Record<string, unknown> = {}) =>
  await store.create(aDocument(overrides));

describe("GET /pages", () => {
  it("returns the seeded pages", async () => {
    await seedPage();
    const response = await app.inject({ method: "GET", url: "/pages" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].title).toBe(
      "Find out how much severance payment you are owed",
    );
  });

  it("omits drafts unless asked", async () => {
    await seedPage({ is_draft: true });

    expect((await app.inject({ url: "/pages" })).json()).toHaveLength(0);
    expect(
      (await app.inject({ url: "/pages?drafts=true" })).json(),
    ).toHaveLength(1);
  });
});

describe("GET /pages/:id", () => {
  it("returns the page", async () => {
    const created = await seedPage();
    const response = await app.inject({ url: `/pages/${created.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json().body.blocks[0].id).toBe("b_one");
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

describe("GET /pages/by-url", () => {
  it("resolves the site's routing key", async () => {
    const created = await seedPage();
    const response = await app.inject({
      url: `/pages/by-url?url=${encodeURIComponent(created.url)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(created.id);
  });

  it("404s for a url nothing is filed under", async () => {
    const response = await app.inject({ url: "/pages/by-url?url=/nope" });
    expect(response.statusCode).toBe(404);
  });

  // "by-url" must not be read as an id by the router.
  it("is not shadowed by the :id route", async () => {
    const response = await app.inject({ url: "/pages/by-url" });
    expect(response.statusCode).toBe(400);
  });

  // #2802: a draft was reachable by anyone who knew or guessed its url.
  it("hides a draft behind a 404, exactly like a missing url", async () => {
    const draft = await seedPage({ url: "/draft-only", is_draft: true });
    const response = await app.inject({
      url: `/pages/by-url?url=${encodeURIComponent(draft.url)}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "not_found",
      message: `No page at ${draft.url}`,
    });
  });

  it("reveals a draft with ?drafts=true, marked no-cache", async () => {
    const draft = await seedPage({ url: "/draft-only", is_draft: true });
    const response = await app.inject({
      url: `/pages/by-url?url=${encodeURIComponent(draft.url)}&drafts=true`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(draft.id);
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("still resolves a published page, unaffected by the drafts param", async () => {
    const created = await seedPage();
    const response = await app.inject({
      url: `/pages/by-url?url=${encodeURIComponent(created.url)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(created.id);
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

  it("422s with the errors per block, not a flattened message", async () => {
    const created = await seedPage();
    const response = await app.inject({
      method: "PUT",
      url: `/pages/${created.id}`,
      payload: {
        ...created,
        body: {
          ...created.body,
          blocks: [
            {
              id: "b_bad",
              type: "finder",
              collection: "does-not-exist",
              document_noun: "pharmacy",
              results_per_page: 20,
              empty_message: "None",
              search: { enabled: false, label: "", fields: [] },
              facets: [],
              sort: [],
              result_template: {
                title: "name",
                metadata: [],
                detail_url: "/x",
              },
            },
          ],
        },
      },
    });

    expect(response.statusCode).toBe(422);
    const { errors } = response.json();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toHaveProperty("blockId");
  });

  it("refuses an unsafe href on ingest, not only on render", async () => {
    const created = await seedPage();
    const response = await app.inject({
      method: "PUT",
      url: `/pages/${created.id}`,
      payload: {
        ...created,
        body: {
          ...created.body,
          refs: {
            r_evil: { kind: "external", href: "javascript:alert(1)" },
          },
        },
      },
    });

    expect(response.statusCode).toBe(422);
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

describe("collections", () => {
  beforeEach(async () => {
    await db.execute(
      (await import("drizzle-orm")).sql`
        insert into data_collections (key, title, record_key, schema)
        values ('pharmacies', 'Pharmacies', 'slug',
                '{"fields":[{"key":"name","label":"Name","type":"text"}]}'::jsonb)
      `,
    );
  });

  it("lists the collections", async () => {
    const response = await app.inject({ url: "/collections" });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).toMatchObject({
      key: "pharmacies",
      record_key: "slug",
    });
  });

  it("round-trips a record", async () => {
    const write = await app.inject({
      method: "PUT",
      url: "/collections/pharmacies/records/collins",
      payload: { data: { name: "Collins Pharmacy" } },
    });
    expect(write.statusCode).toBe(204);

    const read = await app.inject({ url: "/collections/pharmacies/records" });
    expect(read.json()).toEqual([{ name: "Collins Pharmacy" }]);
  });

  it("returns an empty list for a collection with no records", async () => {
    const response = await app.inject({
      url: "/collections/pharmacies/records",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it("deletes a record", async () => {
    await app.inject({
      method: "PUT",
      url: "/collections/pharmacies/records/collins",
      payload: { data: { name: "Collins Pharmacy" } },
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/collections/pharmacies/records/collins",
    });

    expect(response.statusCode).toBe(204);
    expect(
      (await app.inject({ url: "/collections/pharmacies/records" })).json(),
    ).toEqual([]);
  });
});

describe("Cache-Control", () => {
  beforeEach(async () => {
    await db.execute(
      (await import("drizzle-orm")).sql`
        insert into data_collections (key, title, record_key, schema)
        values ('pharmacies', 'Pharmacies', 'slug',
                '{"fields":[{"key":"name","label":"Name","type":"text"}]}'::jsonb)
      `,
    );
  });

  const PUBLIC_READ =
    "public, max-age=60, stale-while-revalidate=300, stale-if-error=86400";

  it("sends PUBLIC_READ from /pages, /pages/by-url and /collections/:key/records", async () => {
    const created = await seedPage();

    const pages = await app.inject({ url: "/pages" });
    const byUrl = await app.inject({
      url: `/pages/by-url?url=${encodeURIComponent(created.url)}`,
    });
    const records = await app.inject({
      url: "/collections/pharmacies/records",
    });

    expect(pages.headers["cache-control"]).toBe(PUBLIC_READ);
    expect(byUrl.headers["cache-control"]).toBe(PUBLIC_READ);
    expect(records.headers["cache-control"]).toBe(PUBLIC_READ);
  });

  it("sends no-cache from /pages/:id, ?drafts=true, ?keys=true and /collections", async () => {
    const created = await seedPage();

    const byId = await app.inject({ url: `/pages/${created.id}` });
    const draftsList = await app.inject({ url: "/pages?drafts=true" });
    const keys = await app.inject({
      url: "/collections/pharmacies/records?keys=true",
    });
    const collections = await app.inject({ url: "/collections" });

    expect(byId.headers["cache-control"]).toBe("no-cache");
    expect(draftsList.headers["cache-control"]).toBe("no-cache");
    expect(keys.headers["cache-control"]).toBe("no-cache");
    expect(collections.headers["cache-control"]).toBe("no-cache");
  });

  it("answers a matching If-None-Match with 304, carrying the same Cache-Control", async () => {
    const created = await seedPage();
    const first = await app.inject({ url: `/pages/${created.id}` });
    const etag = first.headers.etag as string;

    const second = await app.inject({
      url: `/pages/${created.id}`,
      headers: { "if-none-match": etag },
    });

    expect(second.statusCode).toBe(304);
    expect(second.headers["cache-control"]).toBe(
      first.headers["cache-control"],
    );
  });

  // #2835: without a policy every hit for an unknown url reached Postgres.
  it("sends a ten-second policy on the public by-url 404", async () => {
    const response = await app.inject({ url: "/pages/by-url?url=/nope" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["cache-control"]).toBe("public, max-age=10");
    expect(response.headers.etag).toBeUndefined();
  });

  it("sends no Cache-Control on the drafts by-url 404 or the /pages/:id 404", async () => {
    const drafts = await app.inject({
      url: "/pages/by-url?url=/nope&drafts=true",
    });
    const byId = await app.inject({
      url: "/pages/22222222-2222-4222-8222-222222222222",
    });

    expect(drafts.statusCode).toBe(404);
    expect(drafts.headers["cache-control"]).toBeUndefined();
    expect(byId.statusCode).toBe(404);
    expect(byId.headers["cache-control"]).toBeUndefined();
  });

  // A route must only advertise a policy for the response it actually sent —
  // a 500 must not carry PUBLIC_READ just because the handler set it before
  // the store call that then failed.
  it("sends no Cache-Control on a genuine store failure", async () => {
    const brokenApp = await buildApp({ db: {} as Database });
    await brokenApp.ready();

    const response = await brokenApp.inject({ url: "/pages" });

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
      url: "/pages",
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

describe("write auth", () => {
  const TOKEN = "s3cret-write-token";
  let gated: FastifyInstance;

  const build = async (options: {
    writeToken?: string;
    openWrites?: boolean;
  }) => {
    gated = await buildApp({ db, ...options });
    await gated.ready();
    return gated;
  };

  afterEach(async () => {
    await gated?.close();
  });

  it("refuses a write without the token", async () => {
    const api = await build({ writeToken: TOKEN });
    const response = await api.inject({
      method: "POST",
      url: "/pages",
      payload: aDocument(),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "unauthorized" });
  });

  it("refuses a write with the wrong token", async () => {
    const api = await build({ writeToken: TOKEN });
    const created = await seedPage();
    const response = await api.inject({
      method: "DELETE",
      url: `/pages/${created.id}`,
      headers: { authorization: "Bearer not-the-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(await store.get(created.id)).not.toBeNull();
  });

  it("accepts a write with the token", async () => {
    const api = await build({ writeToken: TOKEN });
    const created = await seedPage();
    const response = await api.inject({
      method: "DELETE",
      url: `/pages/${created.id}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(response.statusCode).toBe(204);
  });

  it("gates draft and record-key reads but leaves public reads open", async () => {
    const api = await build({ writeToken: TOKEN });
    await seedPage();

    expect((await api.inject({ url: "/pages" })).statusCode).toBe(200);
    expect((await api.inject({ url: "/pages?drafts=true" })).statusCode).toBe(
      401,
    );
    expect(
      (await api.inject({ url: "/pages/by-url?url=/x&drafts=true" }))
        .statusCode,
    ).toBe(401);
    expect(
      (await api.inject({ url: "/collections/pharmacies/records?keys=true" }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await api.inject({
          url: "/pages?drafts=true",
          headers: { authorization: `Bearer ${TOKEN}` },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("fails closed when no token is configured", async () => {
    const api = await build({ openWrites: false });
    const response = await api.inject({
      method: "POST",
      url: "/pages",
      payload: aDocument(),
    });

    expect(response.statusCode).toBe(401);
  });

  it("stays open when local development opts in", async () => {
    const api = await build({ openWrites: true });
    const response = await api.inject({
      method: "POST",
      url: "/pages",
      payload: aDocument(),
    });

    expect(response.statusCode).toBe(201);
  });

  it("ignores the open-writes opt-in once a token is set", async () => {
    const api = await build({ writeToken: TOKEN, openWrites: true });
    const response = await api.inject({
      method: "POST",
      url: "/pages",
      payload: aDocument(),
    });

    expect(response.statusCode).toBe(401);
  });

  it("lets the editor send the token cross-origin", async () => {
    const api = await build({ writeToken: TOKEN });
    const response = await api.inject({
      method: "OPTIONS",
      url: "/pages/x",
      headers: {
        origin: "http://localhost:3010",
        "access-control-request-method": "DELETE",
        "access-control-request-headers": "authorization",
      },
    });

    expect(
      String(response.headers["access-control-allow-headers"]).toLowerCase(),
    ).toContain("authorization");
  });
});
