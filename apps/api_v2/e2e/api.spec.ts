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

  const SEEDED = "/money-financial-support/calculate-severance-pay";
  const byUrl = (url: string) => get(`/pages?url=${encodeURIComponent(url)}`);

  /** A page of the test's own to write to, so no seeded page is edited. */
  const createPage = async (url: string) => {
    const response = await fetch(`${server.url}/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        title: "An e2e page",
        visibility: "public",
        body_markdown: "Written by the e2e suite.",
      }),
    });
    expect(response.status).toBe(201);
    return await response.json();
  };

  const put = (page: { id: string; updated_at: string }, changes: object) =>
    fetch(`${server.url}/pages/${page.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "if-updated-at": page.updated_at,
      },
      body: JSON.stringify({ ...page, ...changes }),
    });

  it("migrates and seeds an empty database on first boot", async () => {
    const { status, body } = await byUrl(SEEDED);

    expect(status).toBe(200);
    expect(body.hast.children.length).toBeGreaterThan(0);
    expect(body.breadcrumbs[0]).toEqual({
      name: "Money and financial support",
      url: "/money-financial-support",
    });
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
    const { status, body } = await get("/openapi.json");

    expect(status).toBe(200);
    expect(body.openapi).toBe("3.0.3");
    expect(Object.keys(body.paths)).toContain("/pages");
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
      current = await response.json();
    }

    expect(current.title).toBe("Second edit");
    expect(current.updated_at).toMatch(/\.\d{3}Z$/);
  });

  it("refuses a save whose if-updated-at has been overtaken", async () => {
    const stale = await createPage("/e2e/overtaken");

    await put(stale, { title: "Whoever got there first" });
    const second = await put(stale, { title: "Whoever would have clobbered" });

    expect(second.status).toBe(409);
    expect((await get(`/pages/${stale.id}`)).body.title).toBe(
      "Whoever got there first",
    );
  });

  it("names the field a refused page is wrong in", async () => {
    const page = await createPage("/e2e/refused");

    const response = await put(page, { form_id: "no-such-form" });

    expect(response.status).toBe(422);
    const { errors } = await response.json();
    expect(errors).toEqual([
      { field: "form_id", message: "No form with that id." },
    ]);
  });

  it("revalidates with an ETag rather than resending the body", async () => {
    const path = `${server.url}/pages?url=${encodeURIComponent(SEEDED)}`;
    const first = await fetch(path);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const second = await fetch(path, {
      headers: { "If-None-Match": etag as string },
    });

    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("moves its version token when something is written", async () => {
    const before = (await get("/version")).body;

    const page = await createPage("/e2e/version");
    await put(page, { title: "Moved the token" });

    expect((await get("/version")).body.count).toBeGreaterThan(before.count);
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
