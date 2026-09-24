/**
 * The spec has to describe this server, not a previous one.
 *
 * Two things are asserted. The committed `openapi.json` matches what the
 * running app generates, so adding a route or changing a response shape shows
 * up in a pull request's diff rather than only in a running process. And
 * every route the app actually serves is in the document — a route with no
 * schema is invisible to `@fastify/swagger`, which is the quiet way an API
 * grows an undocumented endpoint.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { buildOpenApiDocument } from "./openapi-document";
import { createTestDb } from "./test-db";

const committed = JSON.parse(
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
    const app = await buildApp({ db });
    await app.ready();

    const documented = new Set(
      Object.entries(committed.paths as Record<string, object>).flatMap(
        ([path, operations]) =>
          Object.keys(operations).map(
            (method) => `${method.toUpperCase()} ${path}`,
          ),
      ),
    );

    // `/openapi.json` serves the document and is deliberately not in it.
    const undocumented = servedRoutes(app).filter(
      (route) =>
        route !== "GET /openapi.json" &&
        !documented.has(route.replace(/:(\w+)/g, "{$1}")),
    );

    expect(undocumented).toEqual([]);

    await app.close();
    await close();
  });

  it("is served by the app itself", async () => {
    const { db, close } = await createTestDb();
    const app = await buildApp({ db });
    const response = await app.inject({ url: "/openapi.json" });

    expect(response.statusCode).toBe(200);
    expect(response.json().info.title).toBe("api_v2");

    await app.close();
    await close();
  });
});

describe("response schemas", () => {
  /**
   * Fastify serialises through the response schema, so a property the schema
   * does not know about is dropped from the wire. That is a feature for
   * hygiene and a trap for a block document, whose whole shape is open — this
   * asserts that a document survives the round trip intact rather than
   * arriving stripped of the blocks that make it a page.
   */
  it("does not strip a block document on the way out", async () => {
    const { db, close } = await createTestDb();
    const app = await buildApp({ db });
    const { aDocument } = await import("./test-db");

    const created = await app.inject({
      method: "POST",
      url: "/pages",
      payload: aDocument(),
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().body).toEqual(aDocument().body);

    await app.close();
    await close();
  });

  it("keeps a null description null rather than dropping it", async () => {
    const { db, close } = await createTestDb();
    const app = await buildApp({ db });
    const { aDocument } = await import("./test-db");

    const created = await app.inject({
      method: "POST",
      url: "/pages",
      payload: aDocument({ description: null }),
    });

    expect(created.json()).toHaveProperty("description", null);

    await app.close();
    await close();
  });
});

/**
 * Every route the app serves, as "METHOD /path".
 *
 * `printRoutes` draws a tree, so a leaf's real path is its own segment joined
 * to those of its ancestors — reading each line on its own would report
 * `/:id` as a route in its own right. HEAD and OPTIONS are Fastify's, not
 * ours: it adds them to every GET and to the CORS preflight, and neither is
 * something an OpenAPI document is expected to carry.
 */
function servedRoutes(app: FastifyInstance): string[] {
  const prefixes: string[] = [];
  const routes: string[] = [];

  for (const line of app.printRoutes({ commonPrefix: false }).split("\n")) {
    const match = line.match(/^([\s│]*)(?:├──|└──) (\S*)(?: \(([A-Z, ]+)\))?/);
    if (!match) continue;

    const [, indent, segment, methods] = match;
    const depth = Math.floor(indent.length / 4);
    prefixes.length = depth;
    prefixes.push(segment);

    if (!methods) continue;
    const path = prefixes.join("").replace(/\/$/, "") || "/";
    for (const method of methods.split(", ")) {
      if (method === "HEAD" || method === "OPTIONS") continue;
      routes.push(`${method} ${path}`);
    }
  }

  return routes;
}
