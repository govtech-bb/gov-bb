/**
 * The whole thing, end to end: boot the built server against an empty
 * Postgres, and read and write the estate over HTTP.
 *
 * Each `it` here corresponds to an acceptance criterion on #2700 that the
 * in-process suite can only half prove — because the half it cannot reach is
 * the process, the driver and the socket.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AUTH_ENV,
  createEmployeeSession,
  createScratchDatabase,
  dropScratchDatabase,
  HAS_DATABASE,
  startServer,
  type Server,
} from "./support";

const pageSchema = z
  .object({
    id: z.string(),
    version: z.number().int().positive(),
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
    server = await startServer({ DB_NAME: database, SEED: "true" });
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

  const acquirePageEditLock = async (pageId: string) => {
    const status = z
      .object({ lockGeneration: z.number().int().nonnegative() })
      .parse((await get(`/pages/${pageId}/lock`)).body);
    const token = randomUUID();
    const response = await fetch(`${server.url}/pages/${pageId}/lock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
        origin: AUTH_ENV.EDITOR_ORIGIN,
        "x-page-edit-lock-token": token,
      },
      body: JSON.stringify({
        action: "acquire",
        expectedLockGeneration: status.lockGeneration,
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: "held",
      ownedByCaller: true,
    });
    return token;
  };

  const put = (
    page: z.infer<typeof pageSchema>,
    token: string,
    changes: { title?: string; parent_id?: string },
  ) =>
    fetch(`${server.url}/pages/${page.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie,
        origin: AUTH_ENV.EDITOR_ORIGIN,
        "x-page-edit-lock-token": token,
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

  it("round-trips content versions through node-postgres for repeated saves", async () => {
    let current = await createPage("/e2e/round-trip");
    const token = await acquirePageEditLock(current.id);
    const initialVersion = current.version;

    for (const title of ["First edit", "Second edit"]) {
      const response = await put(current, token, { title });
      expect(response.status).toBe(200);
      current = pageSchema.parse(await response.json());
    }

    expect(current.title).toBe("Second edit");
    expect(current.version).toBe(initialVersion + 2);
    expect(current.updated_at).toMatch(/\.\d{3}Z$/);
  });

  it("refuses a save whose content version has been overtaken", async () => {
    const stale = await createPage("/e2e/overtaken");
    const token = await acquirePageEditLock(stale.id);

    const first = await put(stale, token, { title: "Whoever got there first" });
    expect(first.status).toBe(200);
    const second = await put(stale, token, {
      title: "Whoever would have clobbered",
    });

    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({
      error: "page_version_conflict",
      pageId: stale.id,
    });
    expect((await get(`/pages/${stale.id}`)).body.title).toBe(
      "Whoever got there first",
    );
  });

  it("names the field a refused page is wrong in", async () => {
    const page = await createPage("/e2e/refused");

    const token = await acquirePageEditLock(page.id);
    const response = await put(page, token, {
      parent_id: "22222222-2222-4222-8222-222222222222",
    });

    expect(response.status).toBe(422);
    const { errors } = objectSchema.parse(await response.json());
    expect(errors).toEqual([
      { field: "parent_id", message: "No page with that id." },
    ]);
  });

  it("fails closed for old clients and deletes only with the reviewed version and ownership", async () => {
    const page = await createPage("/e2e/guarded-delete");
    const token = await acquirePageEditLock(page.id);
    const headers = {
      cookie,
      origin: AUTH_ENV.EDITOR_ORIGIN,
      "x-page-edit-lock-token": token,
    };
    const oldSave = await fetch(`${server.url}/pages/${page.id}`, {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "if-updated-at": page.updated_at,
      },
      body: JSON.stringify({ ...page, version: undefined }),
    });
    expect(oldSave.status).toBe(400);
    const missingVersion = await fetch(`${server.url}/pages/${page.id}`, {
      method: "DELETE",
      headers,
    });
    expect(missingVersion.status).toBe(400);
    const response = await fetch(
      `${server.url}/pages/${page.id}?version=${page.version}`,
      { method: "DELETE", headers },
    );
    expect(response.status).toBe(204);
    expect((await get(`/pages/${page.id}`)).status).toBe(404);
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
    const token = await acquirePageEditLock(page.id);
    expect((await put(page, token, { title: "Moved the token" })).status).toBe(
      200,
    );

    expect((await get("/version")).body.count).toBeGreaterThan(
      z.number().parse(before.count),
    );
  });

  it("is safe to restart: the migration and the seed both run again", async () => {
    const edited = await createPage("/e2e/restart");
    const before = (await get("/version")).body;
    await server.stop();

    server = await startServer({ DB_NAME: database, SEED: "true" });

    // The seed is additive: it writes no event and overwrites nothing.
    expect((await get("/version")).body).toEqual(before);
    expect((await get(`/pages/${edited.id}`)).body.title).toBe("An e2e page");
    expect((await byUrl(SEEDED)).status).toBe(200);
  });
});
