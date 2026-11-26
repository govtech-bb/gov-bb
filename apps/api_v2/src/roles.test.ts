/**
 * Roles (#3187, #3197, ADR 0134): only an editor writes, only an approver
 * changes what citizens see, only an admin changes who holds which role,
 * and roles are read from the database on every request.
 */

import { sql } from "drizzle-orm";
import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import pino from "pino";
import { PostgresRoles } from "./adapters/postgres-roles";
import type { Database } from "./db";
import { PostgresPages } from "./adapters/postgres-pages";
import { SelfApproval, UserId, type Employee } from "./modules/auth";
import { PageDocument, withDefaults, type PageId } from "./modules/page";
import {
  PERMISSIONS,
  PermissionDenied,
  ROLES,
  type Permission,
} from "./modules/permissions";
import { Redacted } from "./modules/redacted";
import { ok } from "./modules/result";
import { changeEvents } from "./schema";
import { EditorAccess } from "./services/editor-access";
import {
  aPage,
  createTestApp,
  createTestDb,
  createTestServices,
  requestAs,
  SELF_APPROVAL,
  sessionsFor,
  expectOk,
  TEST_EDITOR,
  TEST_EMPLOYEE,
  TEST_HTTP_CONFIG,
} from "./test-db";

const FIXTURES = [TEST_EMPLOYEE, TEST_EDITOR];

let app: FastifyInstance;
let db: Database;
let close: () => Promise<void>;
let services: ReturnType<typeof createTestServices>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  // Fixtures are set up as AUTH_BYPASS would, so only the app under test
  // holds an approver to the self-approval rule.
  services = createTestServices(db, SELF_APPROVAL);
  // The cookie names the fixture; its roles come from the database.
  app = await createTestApp(db, { sessions: sessionsFor(FIXTURES) });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await close();
});

const seedPage = async (overrides: Record<string, unknown> = {}) => {
  const page = expectOk(
    await services.editing.create(aPage(overrides), TEST_EMPLOYEE),
  );
  return { ...PageDocument.parse(page), version: page.version };
};

const stored = async (id: PageId) =>
  expectOk(await new PostgresPages(db).find(id));

/** The 403 for an editor who tried `to`, which only the approver role allows. */
const forbidden = (to: string) => ({
  error: "forbidden",
  message: `You don't have permission to ${to}. Ask an admin for the approver role.`,
});

const START_LINK_FORBIDDEN = forbidden(
  "add, move, rename or delete a start page under a public page, because " +
    "it decides whether citizens see that page's Start link",
);

describe("a page's visibility", () => {
  it("is not changed by a non-approver's save, which leaves the page as it was", async () => {
    const page = await seedPage({ visibility: "preview" });

    const response = await requestAs(app, TEST_EDITOR, {
      method: "PUT",
      url: `/pages/${page.id}`,
      payload: {
        ...withDefaults(aPage({ visibility: "public", title: "Changed" })),
        expected_version: page.version,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(forbidden("change who can see a page"));
    expect(await stored(page.id)).toEqual(PageDocument.parse(page));
  });

  it("still lets a non-approver edit a page's content", async () => {
    const page = await seedPage();

    const response = await requestAs(app, TEST_EDITOR, {
      method: "PUT",
      url: `/pages/${page.id}`,
      payload: {
        ...withDefaults(aPage({ title: "Changed" })),
        expected_version: page.version,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      title: "Changed",
      visibility: "public",
    });
  });

  it("is changed by an approver, and the change is recorded against them", async () => {
    // Written by someone else, so making it public is the approver's review.
    const page = expectOk(
      await services.editing.create(
        aPage({ visibility: "preview" }),
        TEST_EDITOR,
      ),
    );

    const response = await requestAs(app, TEST_EMPLOYEE, {
      method: "PUT",
      url: `/pages/${page.id}`,
      payload: {
        ...withDefaults(aPage({ visibility: "public" })),
        expected_version: page.version,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().visibility).toBe("public");
    const latest = await db
      .select({ action: changeEvents.action, actor: changeEvents.actor })
      .from(changeEvents)
      .orderBy(changeEvents.versionNo);
    expect(latest.at(-1)).toEqual({
      action: "published",
      actor: TEST_EMPLOYEE.id,
    });
  });
});

describe("creating a page", () => {
  it("as public needs an approver, and creates nothing otherwise", async () => {
    const response = await requestAs(app, TEST_EDITOR, {
      method: "POST",
      url: "/pages",
      payload: aPage({ visibility: "public" }),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(forbidden("create a public page"));
    expect(expectOk(await services.index.version()).count).toBe(0);
  });

  it.each(["preview", "draft", undefined])(
    "as %s is open to a non-approver",
    async (visibility) => {
      const response = await requestAs(app, TEST_EDITOR, {
        method: "POST",
        url: "/pages",
        payload: aPage({ visibility }),
      });

      expect(response.statusCode).toBe(201);
    },
  );
});

describe("deleting a page", () => {
  it("that is public needs an approver, and keeps the page otherwise", async () => {
    const page = await seedPage();

    const response = await requestAs(app, TEST_EDITOR, {
      method: "DELETE",
      url: `/pages/${page.id}?expected_version=${page.version}`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(forbidden("delete a public page"));
    expect(await stored(page.id)).toEqual(PageDocument.parse(page));
    expect(expectOk(await services.index.version()).count).toBe(1);
  });

  it.each(["preview", "draft"])(
    "that is %s is open to a non-approver",
    async (visibility) => {
      const page = await seedPage({ visibility });

      const response = await requestAs(app, TEST_EDITOR, {
        method: "DELETE",
        url: `/pages/${page.id}?expected_version=${page.version}`,
      });

      expect(response.statusCode).toBe(204);
      expect(await stored(page.id)).toBeNull();
    },
  );
});

describe("a public page's Start link", () => {
  const ENTRY = aPage().url;
  const START = `${ENTRY}/start`;

  /** Whether the anonymous read of the entry page hides its Start link. */
  const hidden = async () =>
    (await app.inject({ method: "GET", url: `/pages?url=${ENTRY}` })).json()
      .hide_start_links;

  it("is not hidden by a non-approver's new start sub-page", async () => {
    const parent = await seedPage();

    const response = await requestAs(app, TEST_EDITOR, {
      method: "POST",
      url: "/pages",
      payload: aPage({ url: START, parent_id: parent.id, visibility: "draft" }),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(START_LINK_FORBIDDEN);
    expect(await hidden()).toBe(false);
  });

  it("is not shown by a non-approver deleting the start sub-page that hides it", async () => {
    const parent = await seedPage();
    const start = await seedPage({
      url: START,
      parent_id: parent.id,
      visibility: "draft",
    });

    const response = await requestAs(app, TEST_EDITOR, {
      method: "DELETE",
      url: `/pages/${start.id}?expected_version=${start.version}`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(START_LINK_FORBIDDEN);
    expect(await stored(start.id)).not.toBeNull();
    expect(await hidden()).toBe(true);
  });

  it.each([
    ["moving a hidden page beneath it as its start", "/elsewhere/start", null],
    ["renaming a hidden sub-page of it to start", `${ENTRY}/notes`, "parent"],
  ])("is not hidden by a non-approver %s", async (_, url, parentOf) => {
    const parent = await seedPage();
    const page = await seedPage({
      url,
      parent_id: parentOf === "parent" ? parent.id : null,
      visibility: "draft",
    });

    const response = await requestAs(app, TEST_EDITOR, {
      method: "PUT",
      url: `/pages/${page.id}`,
      payload: {
        ...withDefaults(
          aPage({ url: START, parent_id: parent.id, visibility: "draft" }),
        ),
        expected_version: page.version,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(START_LINK_FORBIDDEN);
    expect(await hidden()).toBe(false);
  });

  it("is not moved by a non-approver between two public pages", async () => {
    const OTHER = "/money-financial-support/claim-unemployment-benefit";
    const a = await seedPage();
    const b = await seedPage({ url: OTHER, title: "Other" });
    const start = await seedPage({
      url: START,
      parent_id: a.id,
      visibility: "draft",
    });
    const hiddenAt = async (url: string) =>
      (await app.inject({ method: "GET", url: `/pages?url=${url}` })).json()
        .hide_start_links;

    const response = await requestAs(app, TEST_EDITOR, {
      method: "PUT",
      url: `/pages/${start.id}`,
      payload: {
        ...withDefaults(
          aPage({
            url: `${OTHER}/start`,
            parent_id: b.id,
            visibility: "draft",
          }),
        ),
        expected_version: start.version,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(START_LINK_FORBIDDEN);
    expect(await hiddenAt(ENTRY)).toBe(true);
    expect(await hiddenAt(OTHER)).toBe(false);
  });

  it("still lets a non-approver edit the start sub-page that hides it", async () => {
    const parent = await seedPage();
    const start = await seedPage({
      url: START,
      parent_id: parent.id,
      visibility: "draft",
    });

    const response = await requestAs(app, TEST_EDITOR, {
      method: "PUT",
      url: `/pages/${start.id}`,
      payload: {
        ...withDefaults(
          aPage({
            url: START,
            parent_id: parent.id,
            visibility: "draft",
            title: "Changed",
          }),
        ),
        expected_version: start.version,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(await hidden()).toBe(true);
  });

  it("still lets a non-approver add a start sub-page beneath a page that isn't public", async () => {
    const parent = await seedPage({ visibility: "draft" });

    const response = await requestAs(app, TEST_EDITOR, {
      method: "POST",
      url: "/pages",
      payload: aPage({ url: START, parent_id: parent.id, visibility: "draft" }),
    });

    expect(response.statusCode).toBe(201);
  });

  it("is hidden by an approver's new start sub-page", async () => {
    const parent = await seedPage();

    const response = await requestAs(app, TEST_EMPLOYEE, {
      method: "POST",
      url: "/pages",
      payload: aPage({ url: START, parent_id: parent.id, visibility: "draft" }),
    });

    expect(response.statusCode).toBe(201);
    expect(await hidden()).toBe(true);
  });
});

describe("an employee whose editor role is revoked", () => {
  it("can still read, but every write is refused, from the next request", async () => {
    const page = await seedPage({ visibility: "draft" });
    await requestAs(app, TEST_EMPLOYEE, {
      method: "DELETE",
      url: `/editor/employees/${TEST_EDITOR.id}/roles/editor`,
    });

    for (const url of ["/services", `/pages/${page.id}`, "/editor/me"])
      expect((await requestAs(app, TEST_EDITOR, { url })).statusCode, url).toBe(
        200,
      );
    const response = await requestAs(app, TEST_EDITOR, {
      method: "PUT",
      url: `/pages/${page.id}`,
      payload: {
        ...withDefaults(aPage({ visibility: "draft", title: "Changed" })),
        expected_version: page.version,
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "forbidden",
      message:
        "You don't have permission to create, change and delete pages, restore an earlier version, and submit a change for review. Ask an admin for the editor role.",
    });
    expect((await stored(page.id))?.title).toBe(page.title);
  });
});

describe("GET /editor/me", () => {
  it("is the signed-in employee and their roles", async () => {
    const response = await requestAs(app, TEST_EDITOR, { url: "/editor/me" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: TEST_EDITOR.id,
      email: TEST_EDITOR.email,
      name: TEST_EDITOR.name,
      roles: ["reader", "editor"],
      permissions: ["content:read", "pages:edit", "collections:edit"],
    });
  });
});

describe("role management", () => {
  const grant = (role: string, id: string = TEST_EDITOR.id) =>
    requestAs(app, TEST_EMPLOYEE, {
      method: "PUT",
      url: `/editor/employees/${id}/roles/${role}`,
    });

  it("lists everyone who has signed in, with their roles", async () => {
    const response = await requestAs(app, TEST_EMPLOYEE, {
      url: "/editor/employees",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      employees: [
        {
          id: TEST_EDITOR.id,
          email: TEST_EDITOR.email,
          name: TEST_EDITOR.name,
          roles: ["reader", "editor"],
        },
        {
          id: TEST_EMPLOYEE.id,
          email: TEST_EMPLOYEE.email,
          name: TEST_EMPLOYEE.name,
          roles: ["reader", "admin", "approver", "editor"],
        },
      ],
    });
  });

  it("grants a role, recording the admin who granted it, from the next request", async () => {
    expect((await grant("approver")).statusCode).toBe(204);
    // A second grant changes nothing.
    expect((await grant("approver")).statusCode).toBe(204);

    const { rows } = await db.execute<{ granted_by: string }>(
      sql`select granted_by from user_roles
          where user_id = ${TEST_EDITOR.id} and role = 'approver'`,
    );
    expect(rows).toEqual([{ granted_by: TEST_EMPLOYEE.id }]);
    expect(
      (await requestAs(app, TEST_EDITOR, { url: "/editor/me" })).json().roles,
    ).toContain("approver");
  });

  it("revokes a role from the next request", async () => {
    await grant("approver");
    const page = await seedPage({ visibility: "draft" });

    const revoked = await requestAs(app, TEST_EMPLOYEE, {
      method: "DELETE",
      url: `/editor/employees/${TEST_EDITOR.id}/roles/approver`,
    });

    expect(revoked.statusCode).toBe(204);
    const response = await requestAs(app, TEST_EDITOR, {
      method: "PUT",
      url: `/pages/${page.id}`,
      payload: {
        ...withDefaults(aPage({ visibility: "public" })),
        expected_version: page.version,
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it("refuses an admin taking away their own admin role, changing nothing", async () => {
    const response = await requestAs(app, TEST_EMPLOYEE, {
      method: "DELETE",
      url: `/editor/employees/${TEST_EMPLOYEE.id}/roles/admin`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "forbidden",
      message:
        "You can't take away your own admin role, because you'd lose the " +
        "permission to give and take away roles. Ask someone else who can.",
    });
    expect(
      (await requestAs(app, TEST_EMPLOYEE, { url: "/editor/me" })).json().roles,
    ).toContain("admin");
  });

  it("404s a grant to someone who has never signed in", async () => {
    const response = await grant("approver", "nobody");

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("not_found");
  });

  it("400s a role that does not exist", async () => {
    expect((await grant("owner")).statusCode).toBe(400);
  });

  it("is refused to a non-admin, changing nothing", async () => {
    for (const request of [
      { url: "/editor/employees" },
      {
        method: "PUT" as const,
        url: `/editor/employees/${TEST_EDITOR.id}/roles/admin`,
      },
      {
        method: "DELETE" as const,
        url: `/editor/employees/${TEST_EMPLOYEE.id}/roles/admin`,
      },
    ]) {
      const response = await requestAs(app, TEST_EDITOR, request);
      expect(response.statusCode, request.url).toBe(403);
      expect(response.json().error).toBe("forbidden");
    }
    expect(
      (await requestAs(app, TEST_EDITOR, { url: "/editor/me" })).json().roles,
    ).toEqual(["reader", "editor"]);
    expect(
      (await requestAs(app, TEST_EMPLOYEE, { url: "/editor/me" })).json().roles,
    ).toContain("admin");
  });
});

describe("API_V2_ADMIN_EMAILS", () => {
  it("makes a listed employee an admin, granted by nobody", async () => {
    const access = new EditorAccess(
      { findSession: async () => ok(TEST_EDITOR) },
      new PostgresRoles(db),
      [TEST_EDITOR.email],
    );

    const employee = expectOk(
      await access.requireEmployee(new Redacted("cookie")),
    );

    expect(employee.roles).toEqual(["reader", "editor", "admin"]);
    const { rows } = await db.execute<{ granted_by: string | null }>(
      sql`select granted_by from user_roles
          where user_id = ${TEST_EDITOR.id} and role = 'admin'`,
    );
    expect(rows).toEqual([{ granted_by: null }]);
  });
});

describe("a role store that fails", () => {
  it("closes access and logs which lookup failed, without the driver's message", async () => {
    const logs: string[] = [];
    const logged = await createTestApp(db, {
      logger: pino({ level: "info" }, { write: (line) => logs.push(line) }),
    });
    await db.execute(sql`drop table user_roles`);
    try {
      const response = await logged.inject({
        url: "/editor/me",
        headers: {
          cookie: "test-session=employee",
          origin: TEST_HTTP_CONFIG.editorOrigin,
        },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "auth_unavailable" });
      const failure = logs
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .find((line) => line.msg === "session lookup failed");
      expect(failure).toMatchObject({
        failure: "role_store_unavailable",
        operation: "rolesOf",
      });
      // The driver's message names the table; it never reaches the log.
      expect(logs.join("\n")).not.toContain("user_roles");
    } finally {
      await logged.close();
    }
  });
});

describe("GET /editor/roles", () => {
  it("describes every role in the table, in its words, to any signed-in employee", async () => {
    const response = await requestAs(app, TEST_EDITOR, {
      url: "/editor/roles",
    });

    expect(response.statusCode).toBe(200);
    const { roles } = response.json();
    // The route holds no list of its own: a role added to the table appears.
    expect(roles.map(({ role }: { role: string }) => role)).toEqual(ROLES);
    expect(roles).toContainEqual({
      role: "approver",
      lets: [
        PERMISSIONS["pages:publish"],
        PERMISSIONS["categories:manage"],
        PERMISSIONS["collections:manage"],
      ],
    });
  });

  it("needs a signed-in employee", async () => {
    const response = await app.inject({
      url: "/editor/roles",
      headers: { origin: TEST_HTTP_CONFIG.editorOrigin },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("the Reader role", () => {
  const NEWCOMER: Employee = {
    id: UserId.parse("newcomer-test"),
    email: "newcomer@govtech.bb",
    name: "Test newcomer",
    roles: [],
  };
  const storedRoles = async () =>
    (
      await db.execute(
        sql`select user_id, role from user_roles order by user_id, role`,
      )
    ).rows;

  it("is all someone signing in for the first time holds: they read the content and change nothing", async () => {
    const page = await seedPage();
    const newcomer = await createTestApp(db, {
      sessions: sessionsFor([NEWCOMER]),
    });
    try {
      const as = (options: Parameters<typeof requestAs>[2]) =>
        requestAs(newcomer, NEWCOMER, options);
      const pages = expectOk(await services.index.version());
      const categories = expectOk(await services.categories.list());

      expect((await as({ url: "/editor/me" })).json().roles).toEqual([
        "reader",
      ]);
      expect((await as({ url: `/pages/${page.id}` })).statusCode).toBe(200);
      expect((await as({ url: "/editor/categories" })).statusCode).toBe(200);
      const pageWrite = await as({
        method: "POST",
        url: "/pages",
        payload: aPage(),
      });
      const categoryWrite = await as({
        method: "POST",
        url: "/editor/categories",
        payload: {
          title: "New",
          slug: "new",
          parent_id: null,
          description: null,
        },
      });

      expect(pageWrite.statusCode).toBe(403);
      expect(categoryWrite.statusCode).toBe(403);
      expect(expectOk(await services.index.version())).toEqual(pages);
      expect(expectOk(await services.categories.list())).toEqual(categories);
    } finally {
      await newcomer.close();
    }
  });

  it("is held by every existing user, with no row in user_roles", async () => {
    const before = await storedRoles();

    expect(
      (await requestAs(app, TEST_EDITOR, { url: "/editor/me" })).json().roles,
    ).toEqual(["reader", "editor"]);
    expect(await storedRoles()).toEqual(before);
    expect(before).not.toContainEqual(
      expect.objectContaining({ role: "reader" }),
    );
  });

  it("can't be given or taken away through the role routes, or stored", async () => {
    const before = await storedRoles();

    for (const method of ["PUT", "DELETE"] as const) {
      const response = await requestAs(app, TEST_EMPLOYEE, {
        method,
        url: `/editor/employees/${TEST_EDITOR.id}/roles/reader`,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "forbidden",
        message:
          "Everyone has the reader role. It can't be given or taken away.",
      });
    }
    expect(await storedRoles()).toEqual(before);
    await expect(
      db.execute(
        sql`insert into user_roles (user_id, role) values (${TEST_EDITOR.id}, 'reader')`,
      ),
    ).rejects.toThrow();
  });
});

describe("the pages:edit and pages:publish checks", () => {
  const APPROVER_ONLY: Employee = {
    id: UserId.parse("approver-only-test"),
    email: "approver-only@govtech.bb",
    name: "Test approver only",
    roles: ["approver"],
  };

  /** Each result refused for lacking `permission`. */
  const refusedFor = (
    permission: Permission,
    results: readonly { ok: boolean; error?: unknown }[],
  ) => {
    for (const result of results) {
      assert(!result.ok);
      expect(result.error).toBeInstanceOf(PermissionDenied);
      expect(result.error).toMatchObject({ permission });
    }
  };

  it("refuses every page write to an approver who isn't an editor, and writes nothing", async () => {
    const page = await seedPage({ visibility: "preview" });
    const publicPage = await seedPage({
      url: "/money-financial-support/public",
    });
    const { editing } = createTestServices(db);
    const before = expectOk(await services.index.version());

    refusedFor("pages:edit", [
      await editing.create(aPage({ visibility: "draft" }), APPROVER_ONLY),
      await editing.save(
        page.id,
        withDefaults(aPage({ title: "Changed", visibility: "preview" })),
        page.version,
        APPROVER_ONLY,
      ),
      await editing.restore(page.id, 1, page.version, APPROVER_ONLY),
      await editing.submit(publicPage.id, publicPage.version, APPROVER_ONLY),
      await editing.delete(page.id, page.version, APPROVER_ONLY),
      await editing.delete(publicPage.id, publicPage.version, APPROVER_ONLY),
    ]);
    expect(expectOk(await services.index.version())).toEqual(before);
    expect(await stored(page.id)).toEqual(PageDocument.parse(page));
    expect(await stored(publicPage.id)).toEqual(PageDocument.parse(publicPage));
  });

  it("refuses to publish or reject to an editor who isn't an approver, and changes nothing", async () => {
    const page = await seedPage();
    const { editing } = createTestServices(db);
    const before = expectOk(await services.index.version());

    refusedFor("pages:publish", [
      await editing.publish(page.id, page.version, TEST_EDITOR),
      await editing.reject(page.id, "No", page.version, TEST_EDITOR),
    ]);
    expect(expectOk(await services.index.version())).toEqual(before);
    expect(await stored(page.id)).toEqual(PageDocument.parse(page));
  });

  it("needs both permissions to create a page as public, and then the self-approval rule", async () => {
    const { editing } = createTestServices(db);

    const asEditor = await editing.create(aPage(), TEST_EDITOR);
    const asApprover = await editing.create(aPage(), APPROVER_ONLY);
    const asBoth = await editing.create(aPage(), TEST_EMPLOYEE);

    refusedFor("pages:publish", [asEditor]);
    assert(!asEditor.ok);
    expect(asEditor.error.message).toBe(
      "You don't have permission to create a public page. Ask an admin for the approver role.",
    );
    refusedFor("pages:edit", [asApprover]);
    assert(!asBoth.ok);
    expect(asBoth.error).toBeInstanceOf(SelfApproval);
    expect(expectOk(await services.index.version()).count).toBe(0);
  });
});
