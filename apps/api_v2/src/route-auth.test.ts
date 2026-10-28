/**
 * Every route that can change something turns away a caller with no session,
 * and records a signed-in caller's change to content against them. The
 * routes come from the app itself, not a list kept here, so a write route
 * added anywhere, outside the editor plugin included, fails this test until
 * it sits behind sign-in and runs as the employee, or is added to
 * PUBLIC_WRITES.
 *
 * The same goes for roles (#3187, #3197): every write route declares the
 * role it needs and refuses an employee with no role, no write route lets a
 * signed-in employee who is not an approver change what citizens see, and
 * no admin route answers someone who is not an admin. A route that changes
 * what citizens see declares the approver role, unless it is one of the page
 * writes whose approver check is in PageEditing (#3199).
 */

import { randomUUID } from "node:crypto";
import diagnostics from "node:diagnostics_channel";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { Database } from "./db";
import { UserId, type Employee } from "./modules/auth";
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

const registered: {
  method: string;
  url: string;
  tags: string[];
  role?: string;
}[] = [];

// Fastify announces each instance on this channel as it is created, before
// buildApp adds a route, so every route the app registers is seen.
const recordRoutes = (message: unknown) =>
  (message as { fastify: FastifyInstance }).fastify.addHook(
    "onRoute",
    (route) => {
      const tags = (route.schema as { tags?: string[] } | undefined)?.tags;
      const role = (route.config as { role?: string } | undefined)?.role;
      for (const method of [route.method].flat())
        registered.push({ method, url: route.url, tags: tags ?? [], role });
    },
  );

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
  id: UserId.parse("no-roles-test"),
  email: "no-roles@govtech.bb",
  name: "Test employee without roles",
  roles: [],
};

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
  diagnostics.subscribe("fastify.initialization", recordRoutes);
  ({ db, close } = await createTestDb());
  app = await createTestApp(db);
  await app.ready();
});

afterEach(async () => {
  diagnostics.unsubscribe("fastify.initialization", recordRoutes);
  await app.close();
  await close();
});

it("finds the editor's writes, so an empty route list cannot pass", () => {
  expect(writes().map(({ method, url }) => `${method} ${url}`)).toEqual(
    expect.arrayContaining([
      "POST /pages",
      "PUT /pages/:id",
      "DELETE /pages/:id",
      "POST /pages/:id/revision/submit",
      "POST /pages/:id/revision/reject",
      "POST /pages/:id/revision/publish",
      "POST /editor/categories",
      "PUT /editor/categories/:id",
      "PUT /editor/categories/order",
      "DELETE /editor/categories/:id",
      "POST /collections/:key/records/:recordKey",
      "PUT /collections/:key/records/:recordKey",
      "DELETE /collections/:key/records/:recordKey",
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
               (select json_agg(r order by r.id) from collection_records r) as records,
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

/** A signed-in request to a page route, about a page of the database's own. */
async function pageWrite(
  method: string,
  url: string,
  n: number,
): Promise<InjectOptions> {
  const id = randomUUID();
  const fields = withDefaults(aPage({ url: `/written-${n}` }));
  await db.execute(
    sql`insert into content_pages (id, url, slug, title, body_markdown)
        values (${id}, ${`/existing-${n}`}, 'existing', 'Existing', '')`,
  );
  // Publishing needs a submitted revision, by someone else, and the version reviewed.
  const reviewed = url.endsWith("/revision/publish")
    ? (
        await db.execute<{ version: string }>(
          sql`insert into page_revisions
                (page_id, status, fields, live_updated_at, created_by, contributors, submitted_by)
              select id, 'submitted', ${JSON.stringify(fields)}::jsonb, updated_at,
                     'other-author', '{other-author}', 'other-author'
              from content_pages where id = ${id}
              returning to_json(updated_at)#>>'{}' as version`,
        )
      ).rows[0]?.version
    : undefined;
  return {
    method: method as InjectOptions["method"],
    url: url.replace(/:\w+/g, id),
    payload: fields,
    headers: reviewed
      ? { ...TEST_HEADERS, "if-updated-at": reviewed }
      : TEST_HEADERS,
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

/** A signed-in request to a record route, about a record of the database's own. */
async function recordWrite(
  method: string,
  url: string,
  n: number,
): Promise<InjectOptions> {
  await db.execute(
    sql`insert into data_collections (key, title, record_key, schema)
        values ('contacts', 'Contacts', 'key',
                '{"fields":[{"key":"key","label":"Key","type":"slug"},{"key":"name","label":"Name","type":"text"}]}')
        on conflict do nothing`,
  );
  await db.execute(
    sql`insert into collection_records (collection_key, record_key, data)
        values ('contacts', ${`existing-${n}`}, '{"name":"Existing"}')`,
  );
  return {
    method: method as InjectOptions["method"],
    url: url
      .replace(":key", "contacts")
      .replace(
        ":recordKey",
        method === "POST" ? `written-${n}` : `existing-${n}`,
      ),
    headers: TEST_HEADERS,
    payload: method === "DELETE" ? undefined : { data: { name: "Written" } },
  };
}

/** Writes that change no content table, so the history has nothing to record, and why. */
const NOT_CONTENT: Readonly<Record<string, string>> = {
  "POST /pages/:id/revision/submit":
    "submits a pending revision, in page_revisions; #3200 records review",
  "POST /pages/:id/revision/reject":
    "rejects a pending revision, in page_revisions; #3200 records review",
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
      : url.startsWith("/collections")
        ? await recordWrite(method, url, n)
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
  "POST /collections/:key/records/:recordKey":
    "adds a collection record; pages are untouched",
  "PUT /collections/:key/records/:recordKey":
    "changes a collection record; pages are untouched",
  "DELETE /collections/:key/records/:recordKey":
    "deletes a collection record; pages are untouched",
  "PUT /editor/employees/:id/roles/:role": "grants a role, in user_roles",
  "DELETE /editor/employees/:id/roles/:role": "revokes a role, in user_roles",
};

/**
 * Page writes that change what citizens see only sometimes, so they declare
 * the editor role and PageEditing refuses a non-approver the changes that
 * need one. Every other route that changes what citizens see must declare
 * the approver role.
 */
const GATED_IN_PAGE_EDITING = new Set([
  "POST /pages",
  "PUT /pages/:id",
  "DELETE /pages/:id",
]);

/** What citizens see of each page by id: a public page's whole row, otherwise only its visibility. */
const citizenView = async () =>
  new Map(
    (
      await db.execute<{ id: string; seen: string }>(
        sql`select id, case when visibility = 'public' then row_to_json(p)::text
                            else visibility::text end as seen
            from content_pages p`,
      )
    ).rows.map((row) => [row.id, row.seen]),
  );
const NOT_SEEN = new Set<string | undefined>([
  undefined,
  ...(["preview", "draft"] satisfies Visibility[]),
]);

/**
 * Send every write route, signed in as `employee`, at a page of each
 * visibility with a payload asking for each visibility. A page the review
 * routes are sent at gets a revision by someone else to act on: a draft for
 * submit, a submitted one for the others. Returns the routes that changed
 * what citizens see (a page that went public or stopped being public, a
 * public page that appeared or disappeared, or a public page's content),
 * and the routes not in NOT_PAGE_VISIBILITY that refused a probe.
 */
async function routesChangingWhatCitizensSee(employee: Employee) {
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
        n += 1;
        const target = randomUUID();
        const fields = withDefaults(
          aPage({ url: `/written-${n}`, visibility: to }),
        );
        await db.execute(
          sql`insert into content_pages (id, url, slug, title, visibility, body_markdown)
              values (${target}, ${`/existing-${n}`}, 'existing', 'Existing', ${from}, '')`,
        );
        // A decision names the version reviewed, so the probe sends the revision's.
        const reviewed = url.includes("/revision/")
          ? (
              await db.execute<{ version: string }>(
                sql`insert into page_revisions
                      (page_id, status, fields, live_updated_at, created_by, contributors, submitted_by)
                    select id, ${url.endsWith("/submit") ? "draft" : "submitted"},
                           ${JSON.stringify(fields)}::jsonb, updated_at,
                           'probe-author', '{probe-author}', 'probe-author'
                    from content_pages where id = ${target}
                    returning to_json(updated_at)#>>'{}' as version`,
              )
            ).rows[0]?.version
          : undefined;
        const before = await citizenView();
        const response = await signedIn.inject({
          method: method as InjectOptions["method"],
          url: url.replace(/:\w+/g, target).replace("*", "x"),
          payload: { ...fields, comment: "Probed" },
          headers: reviewed
            ? { ...TEST_HEADERS, "if-updated-at": reviewed }
            : TEST_HEADERS,
        });
        const route = `${method} ${url}`;
        if (response.statusCode >= 300 && !(route in NOT_PAGE_VISIBILITY))
          refused.add(`${route} (${response.statusCode})`);
        const after = await citizenView();
        const ids = new Set([...before.keys(), ...after.keys()]);
        if (
          [...ids].some(
            (id) =>
              before.get(id) !== after.get(id) &&
              !(NOT_SEEN.has(before.get(id)) && NOT_SEEN.has(after.get(id))),
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
  const { changed, refused } =
    await routesChangingWhatCitizensSee(TEST_EMPLOYEE);
  // A route here wants a header, body or id the probe does not send.
  expect(refused).toEqual([]);
  expect(changed).toEqual([
    "DELETE /pages/:id",
    "POST /pages",
    "POST /pages/:id/revision/publish",
    "PUT /pages/:id",
  ]);
  const roles = new Map(
    writes().map(({ method, url, role }) => [`${method} ${url}`, role]),
  );
  expect(
    changed.filter(
      (route) =>
        roles.get(route) !== "approver" && !GATED_IN_PAGE_EDITING.has(route),
    ),
  ).toEqual([]);
});

it("lets no write route change what citizens see for a non-approver", async () => {
  expect(TEST_EDITOR.roles).not.toContain("approver");
  expect((await routesChangingWhatCitizensSee(TEST_EDITOR)).changed).toEqual(
    [],
  );
});

it("needs the approver role to publish or reject a revision (#3199)", () => {
  const declared = (route: string) =>
    writes().find(({ method, url }) => `${method} ${url}` === route)?.role;
  expect(declared("POST /pages/:id/revision/publish")).toBe("approver");
  expect(declared("POST /pages/:id/revision/reject")).toBe("approver");
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
