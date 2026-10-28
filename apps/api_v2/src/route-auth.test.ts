/**
 * Every route that can change something turns away a caller with no session,
 * and records a signed-in caller's change to content against them. The
 * routes come from the app itself, not a list kept here, so a write route
 * added anywhere, outside the editor plugin included, fails this test until
 * it sits behind sign-in and runs as the employee, or is added to
 * PUBLIC_WRITES.
 *
 * The same goes for roles (#3187): no write route lets a signed-in employee
 * who is not an approver change what citizens see, and no admin route
 * answers someone who is not an admin.
 */

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { Database } from "./db";
import type { Employee } from "./modules/auth";
import { withDefaults, type Visibility } from "./modules/page";
import { ok } from "./modules/result";
import {
  aPage,
  createTestApp,
  createTestDb,
  createTestServices,
  expectOk,
  TEST_EDITOR,
  TEST_EMPLOYEE,
  TEST_HEADERS,
  TEST_HTTP_CONFIG,
} from "./test-db";

const registered = vi.hoisted(
  () => [] as { method: string; url: string; tags: string[] }[],
);

// buildApp has added its routes by the time it returns, so the onRoute hook
// goes on the instance the moment it is created.
vi.mock("fastify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fastify")>();
  const fastify = ((options?: object) => {
    const app = actual.default(options);
    app.addHook("onRoute", (route) => {
      const tags = (route.schema as { tags?: string[] } | undefined)?.tags;
      for (const method of [route.method].flat())
        registered.push({ method, url: route.url, tags: tags ?? [] });
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

const eventsSoFar = async () =>
  (
    await db.execute<{ id: string; actor: string }>(
      sql`select id, actor from change_events`,
    )
  ).rows;

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

/** A signed-in request to a page route, about a page of the database's own. */
async function pageWrite(
  method: string,
  url: string,
  n: number,
): Promise<InjectOptions> {
  const id = randomUUID();
  await db.execute(
    sql`insert into content_pages (id, url, slug, title, body_markdown)
        values (${id}, ${`/existing-${n}`}, 'existing', 'Existing', '')`,
  );
  return {
    method: method as InjectOptions["method"],
    url: url.replace(/:\w+/g, id),
    payload: withDefaults(aPage({ url: `/written-${n}` })),
    headers: TEST_HEADERS,
  };
}

/** A signed-in request to a category route, about categories of the database's own. */
async function categoryWrite(
  method: string,
  url: string,
  n: number,
): Promise<InjectOptions> {
  // Two, so a reorder has something to move.
  await db.execute(
    sql`insert into categories (slug, title)
        values (${`existing-${n}`}, 'Existing'), (${`other-${n}`}, 'Other')`,
  );
  const roots = (
    await app.inject({ url: "/editor/categories", headers: TEST_HEADERS })
  )
    .json<{
      categories: {
        id: string;
        slug: string;
        parent_id: string | null;
        updated_at: string;
      }[];
    }>()
    .categories.filter((row) => row.parent_id === null);
  const target = roots.find((row) => row.slug === `existing-${n}`)!;
  const fields = { slug: target.slug, parent_id: null, description: null };
  return {
    method: method as InjectOptions["method"],
    url: url.replace(/:\w+/g, target.id),
    headers: { ...TEST_HEADERS, "if-updated-at": target.updated_at },
    payload:
      url === "/editor/categories/order"
        ? {
            parent_id: null,
            expected: roots.map(({ id, updated_at }) => ({ id, updated_at })),
            ordered_ids: roots.map((row) => row.id).reverse(),
          }
        : method === "POST"
          ? { ...fields, slug: `written-${n}`, title: "Written" }
          : method === "PUT"
            ? { ...fields, title: "Renamed" }
            : undefined,
  };
}

/** Writes that change no content table, so the history has nothing to record, and why. */
const NOT_CONTENT: Readonly<Record<string, string>> = {
  "PUT /editor/employees/:id/roles/:role": "grants a role, in user_roles",
  "DELETE /editor/employees/:id/roles/:role": "revokes a role, in user_roles",
};

it("records every signed-in write against the employee", async () => {
  const routes = writes().map(({ method, url }) => `${method} ${url}`);
  for (const route of Object.keys(NOT_CONTENT))
    expect(routes, route).toContain(route);
  for (const [n, { method, url }] of writes().entries()) {
    if (`${method} ${url}` in NOT_CONTENT) continue;
    // Something of the database's own for the route to act on, so only the
    // route's change can carry the employee's id.
    const request = url.startsWith("/editor/categories")
      ? await categoryWrite(method, url, n)
      : await pageWrite(method, url, n);
    const before = new Set((await eventsSoFar()).map((event) => event.id));
    const response = await app.inject(request);
    expect(response.statusCode, `${method} ${url}`).toBeLessThan(300);

    // Every change the route made, not just one of them, is the employee's.
    const actors = (await eventsSoFar())
      .filter((event) => !before.has(event.id))
      .map((event) => event.actor);
    expect(actors, `${method} ${url}`).not.toEqual([]);
    expect(new Set(actors), `${method} ${url}`).toEqual(
      new Set([TEST_EMPLOYEE.id]),
    );
  }
});

/**
 * Writes that cannot touch a page's visibility, and why. Every other write
 * route must accept the approver probe below (2xx); one it cannot exercise,
 * because it wants another header, body or kind of id, fails the probe
 * rather than passing unseen. Satisfy it in the probe, or list it here with
 * the reason it cannot change what citizens see.
 */
const NOT_PAGE_VISIBILITY: Readonly<Record<string, string>> = {
  "POST /editor/categories": "creates a category; pages are untouched",
  "PUT /editor/categories/:id": "renames or moves a category, not its pages",
  "PUT /editor/categories/order": "reorders categories; pages are untouched",
  "DELETE /editor/categories/:id": "refuses a category any page is filed under",
  "PUT /editor/employees/:id/roles/:role": "grants a role, in user_roles",
  "DELETE /editor/employees/:id/roles/:role": "revokes a role, in user_roles",
};

/** Every page's visibility by id. */
const visibilities = async () =>
  new Map(
    (
      await db.execute<{ id: string; visibility: Visibility }>(
        sql`select id, visibility from content_pages`,
      )
    ).rows.map((row) => [row.id, row.visibility]),
  );

/**
 * Send every write route, signed in as `employee`, at a page of each
 * visibility with a payload asking for each other visibility. Returns the
 * routes that changed what citizens see (a page that went public or stopped
 * being public, or a public page that appeared or disappeared), and the
 * routes not in NOT_PAGE_VISIBILITY that refused a probe.
 */
async function routesChangingVisibility(employee: Employee) {
  // Before the app below registers its own copies of the routes.
  const routes = writes();
  const signedIn = await createTestApp(db, {
    sessions: { findSession: async () => ok(employee) },
  });
  const changed = new Set<string>();
  const refused = new Set<string>();
  let n = 0;
  for (const { method, url } of routes) {
    for (const from of ["public", "preview", "draft"] as const) {
      for (const to of ["public", "preview", "draft"] as const) {
        if (from === to && method !== "POST") continue;
        n += 1;
        const target = randomUUID();
        await db.execute(
          sql`insert into content_pages (id, url, slug, title, visibility, body_markdown)
              values (${target}, ${`/existing-${n}`}, 'existing', 'Existing', ${from}, '')`,
        );
        const before = await visibilities();
        const response = await signedIn.inject({
          method: method as InjectOptions["method"],
          url: url.replace(/:\w+/g, target).replace("*", "x"),
          payload: withDefaults(
            aPage({ url: `/written-${n}`, visibility: to }),
          ),
          headers: TEST_HEADERS,
        });
        const route = `${method} ${url}`;
        if (response.statusCode >= 300 && !(route in NOT_PAGE_VISIBILITY))
          refused.add(`${route} (${response.statusCode})`);
        const after = await visibilities();
        const ids = new Set([...before.keys(), ...after.keys()]);
        if (
          [...ids].some(
            (id) =>
              before.get(id) !== after.get(id) &&
              (before.get(id) === "public" || after.get(id) === "public"),
          )
        )
          changed.add(route);
      }
    }
  }
  await signedIn.close();
  return { changed: [...changed].sort(), refused: [...refused].sort() };
}

it("lists only write routes that exist as unable to change visibility", () => {
  const routes = writes().map(({ method, url }) => `${method} ${url}`);
  for (const route of Object.keys(NOT_PAGE_VISIBILITY))
    expect(routes, route).toContain(route);
});

it("exercises every write route as an approver, so a route the probe cannot reach fails rather than passes", async () => {
  const { changed, refused } = await routesChangingVisibility(TEST_EMPLOYEE);
  // A route here wants a header, body or id the probe does not send.
  expect(refused).toEqual([]);
  expect(changed).toEqual([
    "DELETE /pages/:id",
    "POST /pages",
    "PUT /pages/:id",
  ]);
});

it("lets no write route change what citizens see for a non-approver", async () => {
  expect(TEST_EDITOR.roles).not.toContain("approver");
  expect((await routesChangingVisibility(TEST_EDITOR)).changed).toEqual([]);
});

it("refuses every admin route to a non-admin", async () => {
  const admin = registered.filter(({ tags }) => tags.includes("admin"));
  expect(admin.length).toBeGreaterThan(0);
  const signedIn = await createTestApp(db, {
    sessions: { findSession: async () => ok(TEST_EDITOR) },
  });
  for (const { method, url } of admin) {
    const response = await signedIn.inject({
      method: method as InjectOptions["method"],
      url: url.replace(":id", TEST_EDITOR.id).replace(":role", "admin"),
      headers: TEST_HEADERS,
    });
    expect(response.statusCode, `${method} ${url}`).toBe(403);
  }
  await signedIn.close();
  expect(
    (
      await db.execute(
        sql`select 1 from user_roles where user_id = ${TEST_EDITOR.id} and role = 'admin'`,
      )
    ).rows,
  ).toEqual([]);
});
