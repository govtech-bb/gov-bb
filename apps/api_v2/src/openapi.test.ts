/**
 * The spec has to describe this server, not a previous one.
 *
 * The committed `openapi.json` is a file snapshot of what the real app
 * generates from its route schemas, so adding a route or changing a response
 * shape shows up in a pull request's diff rather than only in a running
 * process. Update it with `pnpm exec vitest run src/openapi.test.ts -u`.
 */

import { describe, expect, it } from "vitest";
import { aPage, createTestApp, createTestDb, TEST_HEADERS } from "./test-db";

describe("openapi.json", () => {
  it("matches what the app generates", async () => {
    const { db, close } = await createTestDb();
    const app = await createTestApp(db);
    await app.ready();

    await expect(
      `${JSON.stringify(app.swagger(), null, 2)}\n`,
    ).toMatchFileSnapshot("../openapi.json");

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
