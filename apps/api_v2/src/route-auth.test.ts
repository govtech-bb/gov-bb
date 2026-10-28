/**
 * Every route that can change something turns away a caller with no session.
 * The routes come from the app itself, not a list kept here, so a write route
 * added anywhere, outside the editor plugin included, fails this test until
 * it sits behind sign-in or is added to PUBLIC_WRITES.
 *
 * The same goes for roles (#3187, #3197): every write route declares the
 * role it needs and refuses an employee with no role, no write route lets a
 * signed-in employee who is not an approver change what citizens see, and
 * no admin route answers someone who is not an admin.
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
  () => [] as { method: string; url: string; tags: string[]; role?: string }[],
);

// buildApp has added its routes by the time it returns, so the onRoute hook
// goes on the instance the moment it is created.
vi.mock("fastify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fastify")>();
  const fastify = ((options?: object) => {
    const app = actual.default(options);
    app.addHook("onRoute", (route) => {
      const tags = (route.schema as { tags?: string[] } | undefined)?.tags;
      const role = (route.config as { role?: string } | undefined)?.role;
      for (const method of [route.method].flat())
        registered.push({ method, url: route.url, tags: tags ?? [], role });
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

/** A signed-in employee holding no role, as one is after an admin revokes theirs. */
const NO_ROLES: Employee = {
  id: "no-roles-test",
  email: "no-roles@govtech.bb",
  name: "Test employee without roles",
  roles: [],
};

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

it("declares the role every write route needs, so none is open to any employee", () => {
  const undeclared = writes()
    .filter(({ role }) => role === undefined)
    .map(({ method, url }) => `${method} ${url}`);
  expect(undeclared).toEqual([]);
});

it("refuses every write to an employee with no role and leaves the database unchanged", async () => {
  await db.execute(
    sql`insert into auth_user (id, name, email, "emailVerified")
        values (${NO_ROLES.id}, ${NO_ROLES.name}, ${NO_ROLES.email}, true)`,
  );
  // A draft, so no refusal here is the approver check's.
  const page = expectOk(
    await createTestServices(db).editing.create(
      aPage({ visibility: "draft" }),
      TEST_EMPLOYEE,
    ),
  );
  const snapshot = async () =>
    (
      await db.execute(sql`
        select (select json_agg(p order by p.id) from content_pages p) as pages,
               (select json_agg(c order by c.id) from categories c) as categories,
               (select json_agg(r order by r.id) from page_revisions r) as revisions,
               (select count(*)::int from change_events) as events,
               (select json_agg(r order by r.user_id, r.role) from user_roles r) as roles`)
    ).rows;
  const before = await snapshot();
  const signedIn = await createTestApp(db, {
    sessions: { findSession: async () => ok(NO_ROLES) },
  });
  for (const { method, url } of writes()) {
    const response = await signedIn.inject({
      method: method as InjectOptions["method"],
      url: url
        .replace(":id", page.id)
        .replace(":role", "editor")
        .replace("*", "x"),
      payload: withDefaults(aPage({ url: "/written", visibility: "draft" })),
      headers: TEST_HEADERS,
    });
    expect(response.statusCode, `${method} ${url}`).toBe(403);
    expect(response.json(), `${method} ${url}`).toEqual({
      error: "forbidden",
      message: expect.stringMatching(/role/),
    });
  }
  await signedIn.close();
  expect(await snapshot()).toEqual(before);
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
