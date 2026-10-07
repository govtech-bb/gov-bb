/**
 * The spec has to describe this server, not a previous one.
 *
 * Two things are asserted. The committed `openapi.json` matches what the
 * running app generates, so adding a route or changing a response shape shows
 * up in a pull request's diff rather than only in a running process. And
 * the running app's route registrations produce the same document as the
 * standalone builder, so a missing registration cannot hide behind the catalog.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./openapi-document";
import { aPage, createTestApp, createTestDb, TEST_HEADERS } from "./test-db";

const committed: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "openapi.json"),
    "utf8",
  ),
);

describe("openapi.json", () => {
  it("matches what the app generates", async () => {
    expect(await buildOpenApiDocument()).toEqual(committed);
    // If this fails: pnpm --filter @govtech-bb/api-v2 openapi
  });

  it("documents every route the app serves", async () => {
    const { db, close } = await createTestDb();
    const app = await createTestApp(db);
    await app.ready();

    // Check the actual registrations as well as the standalone catalog builder.
    // Fastify's printed tree omits auth's wildcard beneath CORS's OPTIONS *.
    expect(app.swagger()).toEqual(committed);

    await app.close();
    await close();
  });

  it("is served by the app itself", async () => {
    const { db, close } = await createTestDb();
    const app = await createTestApp(db);
    const response = await app.inject({ url: "/docs/openapi.json" });

    expect(response.statusCode).toBe(200);
    expect(response.json().info.title).toBe("api_v2");

    await app.close();
    await close();
  });

  it("is browsable as a reference page at /docs", async () => {
    const { db, close } = await createTestDb();
    const app = await createTestApp(db);
    const response = await app.inject({ url: "/docs" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/html/);
    expect(response.body).toContain('data-url="/docs/openapi.json"');

    await app.close();
    await close();
  });
});

describe("response schemas", () => {
  it("keeps a null description null rather than dropping it", async () => {
    const { db, close } = await createTestDb();
    const app = await createTestApp(db);

    const created = await app.inject({
      method: "POST",
      url: "/pages",
      payload: aPage({ description: null }),
      headers: TEST_HEADERS,
    });

    expect(created.json()).toHaveProperty("description", null);

    await app.close();
    await close();
  });
});
