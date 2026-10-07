/**
 * The whole thing, end to end: boot the built server against an empty
 * Postgres, and read and write the estate over HTTP.
 *
 * Each `it` here corresponds to an acceptance criterion on #2700 that the
 * in-process suite can only half prove — because the half it cannot reach is
 * the process, the driver and the socket.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AUTH_ENV,
  createEmployeeSession,
  createScratchDatabase,
  databaseQuery,
  dropScratchDatabase,
  HAS_DATABASE,
  startServer,
  type Server,
} from "./support";

const pageSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    title: z.string(),
    updated_at: z.string(),
    body_markdown: z.string(),
    visibility: z.enum(["public", "preview", "draft"]),
  })
  .passthrough();
const objectSchema = z.record(z.string(), z.unknown());

describe.skipIf(!HAS_DATABASE)("api_v2 over HTTP", () => {
  let server: Server;
  let database: string;
  let cookie: string;

  beforeAll(async () => {
    database = await createScratchDatabase();
    server = await startServer({ DB_NAME: database });
    cookie = (await createEmployeeSession(database, server.url)).cookie;
  });

  afterAll(async () => {
    await server?.stop();
    if (database) await dropScratchDatabase(database);
  });

  const get = async (path: string) => {
    const response = await fetch(`${server.url}${path}`, {
      headers: { cookie },
    });
    return {
      status: response.status,
      headers: response.headers,
      body: objectSchema.parse(await response.json()),
    };
  };

  const SEEDED = "/money-financial-support/calculate-severance-pay";
  const byUrl = (url: string) => get(`/pages?url=${encodeURIComponent(url)}`);

  /** A page of the test's own to write to, so no seeded page is edited. */
  const createPage = async (url: string) => {
    const response = await fetch(`${server.url}/pages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
        origin: AUTH_ENV.EDITOR_ORIGIN,
      },
      body: JSON.stringify({
        url,
        title: "An e2e page",
        visibility: "public",
        body_markdown: "Written by the e2e suite.",
      }),
    });
    expect(response.status).toBe(201);
    return pageSchema.parse(await response.json());
  };

  const put = (page: { id: string; updated_at: string }, changes: object) =>
    fetch(`${server.url}/pages/${page.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie,
        origin: AUTH_ENV.EDITOR_ORIGIN,
        "if-updated-at": page.updated_at,
      },
      body: JSON.stringify({ ...page, ...changes }),
    });

  it("migrates and seeds an empty database on first boot", async () => {
    const { status, body } = await byUrl(SEEDED);

    expect(status).toBe(200);
    expect(z.string().parse(body.body_markdown).length).toBeGreaterThan(0);
    expect(z.array(z.unknown()).parse(body.breadcrumbs)[0]).toEqual({
      name: "Money and financial support",
      url: "/money-financial-support",
    });
    // The seed carries landing's publish_date over as published_at.
    expect(body.published_at).toBe("2026-05-12T00:00:00.000Z");
    expect(z.iso.datetime().parse(body.updated_at)).toBeTruthy();
  });

  it("redirects a bare slug to its canonical url", async () => {
    const response = await fetch(
      `${server.url}/pages?url=/calculate-severance-pay`,
      { redirect: "manual" },
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(SEEDED);
  });

  it("404s a url nothing is filed under, with JSON and no stack trace", async () => {
    const response = await fetch(`${server.url}/pages?url=/nothing/here`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      error: "not_found",
      message: "No page at /nothing/here",
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

  it("serves its own OpenAPI document", async () => {
    const { status, body } = await get("/docs/openapi.json");

    expect(status).toBe(200);
    expect(body.openapi).toBe("3.0.3");
    expect(Object.keys(objectSchema.parse(body.paths))).toContain("/pages");
  });

  /**
   * The bug PGlite could not find. Postgres stores `timestamptz` to
   * microseconds and `toISOString()` emits milliseconds, so a bare
   * `timestamptz` made every save look like a conflict — against a real
   * server, through the real driver, which is exactly this path.
   */
  it("round-trips updated_at through node-postgres well enough to save twice", async () => {
    let current = await createPage("/e2e/round-trip");

    for (const title of ["First edit", "Second edit"]) {
      const response = await put(current, { title });
      expect(response.status).toBe(200);
      current = pageSchema.parse(await response.json());
    }

    expect(current.title).toBe("Second edit");
    expect(current.updated_at).toMatch(/\.\d{3}Z$/);
  });

  it("refuses a save whose if-updated-at has been overtaken", async () => {
    const page = await createPage("/e2e/overtaken");
    // A create and edit can share one millisecond; give the prior version a
    // distinct timestamp without changing the application's version policy.
    await databaseQuery(
      database,
      "update content_pages set updated_at = $2 where id = $1",
      [page.id, new Date(Date.now() - 60_000)],
    );
    const stale = pageSchema.parse((await get(`/pages/${page.id}`)).body);

    const first = await put(stale, { title: "Whoever got there first" });
    expect(first.status).toBe(200);
    const second = await put(stale, { title: "Whoever would have clobbered" });

    expect(second.status).toBe(409);
    expect((await get(`/pages/${stale.id}`)).body.title).toBe(
      "Whoever got there first",
    );
  });

  it("names the field a refused page is wrong in", async () => {
    const page = await createPage("/e2e/refused");

    const response = await put(page, {
      parent_id: "22222222-2222-4222-8222-222222222222",
    });

    expect(response.status).toBe(422);
    const { errors } = objectSchema.parse(await response.json());
    expect(errors).toEqual([
      { field: "parent_id", message: "No page with that id." },
    ]);
  });

  it("revalidates with an ETag rather than resending the body", async () => {
    const path = `${server.url}/pages?url=${encodeURIComponent(SEEDED)}`;
    const first = await fetch(path);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const second = await fetch(path, {
      headers: { "If-None-Match": etag ?? "" },
    });

    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("moves its version token when something is written", async () => {
    const before = (await get("/version")).body;

    const page = await createPage("/e2e/version");
    await put(page, { title: "Moved the token" });

    expect((await get("/version")).body.count).toBeGreaterThan(
      z.number().parse(before.count),
    );
  });

  it("is safe to restart: the migration and the seed both run again", async () => {
    const edited = await createPage("/e2e/restart");
    const before = (await get("/version")).body;
    await server.stop();

    server = await startServer({ DB_NAME: database });

    // The seed is additive: it writes no event and overwrites nothing.
    expect((await get("/version")).body).toEqual(before);
    expect((await get(`/pages/${edited.id}`)).body.title).toBe("An e2e page");
    expect((await byUrl(SEEDED)).status).toBe(200);
  });
});
