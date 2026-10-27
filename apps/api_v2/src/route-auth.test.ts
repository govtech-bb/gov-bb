/**
 * Every route that can change something turns away a caller with no session.
 * The routes come from the app itself, not a list kept here, so a write route
 * added anywhere, outside the editor plugin included, fails this test until
 * it sits behind sign-in or is added to PUBLIC_WRITES.
 */

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { Database } from "./db";
import {
  aPage,
  createTestApp,
  createTestDb,
  createTestServices,
  expectOk,
  TEST_HTTP_CONFIG,
} from "./test-db";

const registered = vi.hoisted(() => [] as { method: string; url: string }[]);

// buildApp has added its routes by the time it returns, so the onRoute hook
// goes on the instance the moment it is created.
vi.mock("fastify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fastify")>();
  const fastify = ((options?: object) => {
    const app = actual.default(options);
    app.addHook("onRoute", (route) => {
      for (const method of [route.method].flat())
        registered.push({ method, url: route.url });
    });
    return app;
  }) as typeof actual.default;
  return { ...actual, default: fastify };
});

/** Writes that must work signed out, and why. */
const PUBLIC_WRITES = new Set([
  "OPTIONS *", // CORS preflight: browsers send it without credentials
  "POST /api/auth/*", // signing in is how a caller gets a session
]);
const READS = new Set(["GET", "HEAD"]);

const writes = () =>
  registered.filter(
    ({ method, url }) =>
      !READS.has(method) && !PUBLIC_WRITES.has(`${method} ${url}`),
  );

let app: FastifyInstance;
let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  registered.length = 0;
  ({ db, close } = await createTestDb());
  app = await createTestApp(db);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await close();
});

it("finds the editor's writes, so an empty route list cannot pass", () => {
  expect(writes().map(({ method, url }) => `${method} ${url}`)).toEqual(
    expect.arrayContaining([
      "POST /pages",
      "PUT /pages/:id",
      "DELETE /pages/:id",
      "POST /editor/categories",
      "PUT /editor/categories/:id",
      "PUT /editor/categories/order",
      "DELETE /editor/categories/:id",
    ]),
  );
});

it("refuses every write without a session and leaves the database unchanged", async () => {
  for (const { method, url } of writes()) {
    const response = await app.inject({
      // Fastify registered it, so inject can send it.
      method: method as InjectOptions["method"],
      url: url.replace(/:\w+/g, randomUUID()).replace("*", "x"),
      payload: aPage(),
      headers: { origin: TEST_HTTP_CONFIG.editorOrigin },
    });
    expect(response.statusCode, `${method} ${url}`).toBe(401);
    expect(response.json(), `${method} ${url}`).toEqual({
      error: "unauthenticated",
    });
  }
  expect(expectOk(await createTestServices(db).index.version())).toEqual({
    count: 0,
    latest: null,
  });
});
