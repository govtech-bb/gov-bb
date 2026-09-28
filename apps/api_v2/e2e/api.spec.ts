/**
 * The whole thing, end to end: boot the built server against an empty
 * Postgres, and read and write the estate over HTTP.
 *
 * Each `it` here corresponds to an acceptance criterion on #2700 that the
 * in-process suite can only half prove — because the half it cannot reach is
 * the process, the driver and the socket.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createScratchDatabase,
  dropScratchDatabase,
  HAS_DATABASE,
  startServer,
  type Server,
} from "./support";

describe.skipIf(!HAS_DATABASE)("api_v2 over HTTP", () => {
  let server: Server;
  let database: string;

  beforeAll(async () => {
    database = await createScratchDatabase();
    server = await startServer({ DB_NAME: database });
  });

  afterAll(async () => {
    await server?.stop();
    if (database) await dropScratchDatabase(database);
  });

  const get = async (path: string) => {
    const response = await fetch(`${server.url}${path}`);
    return {
      status: response.status,
      headers: response.headers,
      body: response.status === 204 ? null : await response.json(),
    };
  };

  it("migrates and seeds an empty database on first boot", async () => {
    const { status, body } = await get("/pages");

    expect(status).toBe(200);
    expect(body.length).toBeGreaterThan(0);
  });

  it("serves a page by the url the site routes on", async () => {
    const [summary] = (await get("/pages")).body;
    const { status, body } = await get(
      `/pages/by-url?url=${encodeURIComponent(summary.url)}`,
    );

    expect(status).toBe(200);
    expect(body.id).toBe(summary.id);
    expect(body.body.blocks.length).toBeGreaterThan(0);
  });

  it("404s a url nothing is filed under, with JSON and no stack trace", async () => {
    const response = await fetch(`${server.url}/pages/by-url?url=/nothing`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      error: "not_found",
      message: "No page at /nothing",
    });
    // A stack frame, which is what leaks when an error handler forwards the
    // exception instead of answering with a body.
    expect(text).not.toMatch(/\n\s+at /);
  });

  it("404s an id nothing is filed under", async () => {
    const { status, body } = await get(
      "/pages/99999999-9999-4999-8999-999999999999",
    );

    expect(status).toBe(404);
    expect(body).toMatchObject({ error: "not_found" });
  });

  it("serves the collections and their records", async () => {
    const collections = (await get("/collections")).body;
    expect(collections.length).toBeGreaterThan(0);

    const records = await get(`/collections/${collections[0].key}/records`);
    expect(records.status).toBe(200);
    expect(Array.isArray(records.body)).toBe(true);
  });

  it("serves its own OpenAPI document", async () => {
    const { status, body } = await get("/openapi.json");

    expect(status).toBe(200);
    expect(body.openapi).toBe("3.0.3");
    expect(Object.keys(body.paths)).toContain("/pages/by-url");
  });

  /**
   * The bug PGlite could not find. Postgres stores `timestamptz` to
   * microseconds and `toISOString()` emits milliseconds, so a bare
   * `timestamptz` made every save look like a conflict — against a real
   * server, through the real driver, which is exactly this path.
   */
  it("round-trips updated_at through node-postgres well enough to save twice", async () => {
    const [summary] = (await get("/pages")).body;
    let current = (await get(`/pages/${summary.id}`)).body;

    for (const title of ["First edit", "Second edit"]) {
      const response = await fetch(`${server.url}/pages/${current.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "if-updated-at": current.updated_at,
        },
        body: JSON.stringify({ ...current, title }),
      });

      expect(response.status).toBe(200);
      current = await response.json();
    }

    expect(current.title).toBe("Second edit");
    expect(current.updated_at).toMatch(/\.\d{3}Z$/);
  });

  it("refuses a save whose if-updated-at has been overtaken", async () => {
    const [summary] = (await get("/pages")).body;
    const stale = (await get(`/pages/${summary.id}`)).body;

    await fetch(`${server.url}/pages/${stale.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "if-updated-at": stale.updated_at,
      },
      body: JSON.stringify({ ...stale, title: "Whoever got there first" }),
    });

    const second = await fetch(`${server.url}/pages/${stale.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "if-updated-at": stale.updated_at,
      },
      body: JSON.stringify({ ...stale, title: "Whoever would have clobbered" }),
    });

    expect(second.status).toBe(409);
    expect((await get(`/pages/${stale.id}`)).body.title).toBe(
      "Whoever got there first",
    );
  });

  it("names the blocks a rejected document is wrong in", async () => {
    const [summary] = (await get("/pages")).body;
    const page = (await get(`/pages/${summary.id}`)).body;

    const response = await fetch(`${server.url}/pages/${page.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...page,
        body: {
          ...page.body,
          refs: { r_evil: { kind: "external", href: "javascript:alert(1)" } },
        },
      }),
    });

    expect(response.status).toBe(422);
    const { errors } = await response.json();
    expect(errors.length).toBeGreaterThan(0);
  });

  it("revalidates with an ETag rather than resending the body", async () => {
    const first = await fetch(`${server.url}/pages`);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const second = await fetch(`${server.url}/pages`, {
      headers: { "If-None-Match": etag as string },
    });

    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("moves its version token when something is written", async () => {
    const before = (await get("/version")).body;

    const [summary] = (await get("/pages")).body;
    const page = (await get(`/pages/${summary.id}`)).body;
    await fetch(`${server.url}/pages/${page.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "if-updated-at": page.updated_at,
      },
      body: JSON.stringify({ ...page, title: "Moved the token" }),
    });

    expect((await get("/version")).body.count).toBeGreaterThan(before.count);
  });

  it("is safe to restart: the migration and the seed both run again", async () => {
    const before = (await get("/pages")).body.length;
    await server.stop();

    server = await startServer({ DB_NAME: database });

    expect((await get("/pages")).body.length).toBe(before);
  });
});
