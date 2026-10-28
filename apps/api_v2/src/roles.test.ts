/**
 * Roles (#3187, #3197, ADR 0079): only an editor writes, only an approver
 * changes what citizens see, only an admin changes who holds which role,
 * and roles are read from the database on every request.
 */

import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import pino from "pino";
import { PostgresRoles } from "./adapters/postgres-roles";
import type { Database } from "./db";
import type { Employee } from "./modules/auth";
import { PostgresPages } from "./adapters/postgres-pages";
import { withDefaults, type PageId } from "./modules/page";
import { Redacted } from "./modules/redacted";
import { ok } from "./modules/result";
import { changeEvents } from "./schema";
import { EditorAccess } from "./services/editor-access";
import {
  aPage,
  createTestApp,
  createTestDb,
  createTestServices,
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
  services = createTestServices(db);
  // The cookie names the fixture; its roles come from the database.
  app = await createTestApp(db, {
    sessions: {
      findSession: async (cookie) =>
        ok(
          FIXTURES.find((employee) =>
            cookie.reveal().endsWith(`=${employee.id}`),
          ) ?? null,
        ),
    },
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await close();
});

/** A browser request from the editor, signed in as `employee`. */
const as = (employee: Employee, options: InjectOptions) =>
  app.inject({
    ...options,
    headers: {
      cookie: `test-session=${employee.id}`,
      origin: TEST_HTTP_CONFIG.editorOrigin,
      ...options.headers,
    },
  });

const seedPage = async (overrides: Record<string, unknown> = {}) =>
  expectOk(await services.editing.create(aPage(overrides), TEST_EMPLOYEE));

const stored = async (id: PageId) =>
  expectOk(await new PostgresPages(db).find(id));

const FORBIDDEN = {
  error: "forbidden",
  message: "Only approvers can change who can see a page.",
};

describe("a page's visibility", () => {
  it("is not changed by a non-approver's save, which leaves the page as it was", async () => {
    const page = await seedPage({ visibility: "preview" });

    const response = await as(TEST_EDITOR, {
      method: "PUT",
      url: `/pages/${page.id}`,
      payload: withDefaults(aPage({ visibility: "public", title: "Changed" })),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(FORBIDDEN);
    expect(await stored(page.id)).toEqual(page);
  });

  it("still lets a non-approver edit a page's content", async () => {
    const page = await seedPage();

    const response = await as(TEST_EDITOR, {
      method: "PUT",
      url: `/pages/${page.id}`,
      payload: withDefaults(aPage({ title: "Changed" })),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      title: "Changed",
      visibility: "public",
    });
  });

  it("is changed by an approver, and the change is recorded against them", async () => {
    const page = await seedPage({ visibility: "preview" });

    const response = await as(TEST_EMPLOYEE, {
      method: "PUT",
      url: `/pages/${page.id}`,
      payload: withDefaults(aPage({ visibility: "public" })),
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
    const response = await as(TEST_EDITOR, {
      method: "POST",
      url: "/pages",
      payload: aPage({ visibility: "public" }),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(FORBIDDEN);
    expect(expectOk(await services.index.version()).count).toBe(0);
  });

  it.each(["preview", "draft", undefined])(
    "as %s is open to a non-approver",
    async (visibility) => {
      const response = await as(TEST_EDITOR, {
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

    const response = await as(TEST_EDITOR, {
      method: "DELETE",
      url: `/pages/${page.id}`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(FORBIDDEN);
    expect(await stored(page.id)).toEqual(page);
    expect(expectOk(await services.index.version()).count).toBe(1);
  });

  it.each(["preview", "draft"])(
    "that is %s is open to a non-approver",
    async (visibility) => {
      const page = await seedPage({ visibility });

      const response = await as(TEST_EDITOR, {
        method: "DELETE",
        url: `/pages/${page.id}`,
      });

      expect(response.statusCode).toBe(204);
      expect(await stored(page.id)).toBeNull();
    },
  );
});

describe("an employee whose editor role is revoked", () => {
  it("can still read, but every write is refused, from the next request", async () => {
    const page = await seedPage({ visibility: "draft" });
    await as(TEST_EMPLOYEE, {
      method: "DELETE",
      url: `/editor/employees/${TEST_EDITOR.id}/roles/editor`,
    });

    for (const url of ["/services", `/pages/${page.id}`, "/editor/me"])
      expect((await as(TEST_EDITOR, { url })).statusCode, url).toBe(200);
    const response = await as(TEST_EDITOR, {
      method: "PUT",
      url: `/pages/${page.id}`,
      payload: withDefaults(aPage({ visibility: "draft", title: "Changed" })),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "forbidden",
      message:
        "You need the editor role to make changes. Ask an admin to grant it.",
    });
    expect((await stored(page.id))?.title).toBe(page.title);
  });
});

describe("GET /editor/me", () => {
  it("is the signed-in employee and their roles", async () => {
    const response = await as(TEST_EDITOR, { url: "/editor/me" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: TEST_EDITOR.id,
      email: TEST_EDITOR.email,
      name: TEST_EDITOR.name,
      roles: ["editor"],
    });
  });
});

describe("role management", () => {
  const grant = (role: string, id = TEST_EDITOR.id) =>
    as(TEST_EMPLOYEE, {
      method: "PUT",
      url: `/editor/employees/${id}/roles/${role}`,
    });

  it("lists everyone who has signed in, with their roles", async () => {
    const response = await as(TEST_EMPLOYEE, { url: "/editor/employees" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      employees: [
        {
          id: TEST_EDITOR.id,
          email: TEST_EDITOR.email,
          name: TEST_EDITOR.name,
          roles: ["editor"],
        },
        {
          id: TEST_EMPLOYEE.id,
          email: TEST_EMPLOYEE.email,
          name: TEST_EMPLOYEE.name,
          roles: ["admin", "approver", "editor"],
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
      (await as(TEST_EDITOR, { url: "/editor/me" })).json().roles,
    ).toContain("approver");
  });

  it("revokes a role from the next request", async () => {
    await grant("approver");
    const page = await seedPage({ visibility: "draft" });

    const revoked = await as(TEST_EMPLOYEE, {
      method: "DELETE",
      url: `/editor/employees/${TEST_EDITOR.id}/roles/approver`,
    });

    expect(revoked.statusCode).toBe(204);
    const response = await as(TEST_EDITOR, {
      method: "PUT",
      url: `/pages/${page.id}`,
      payload: withDefaults(aPage({ visibility: "public" })),
    });
    expect(response.statusCode).toBe(403);
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
      const response = await as(TEST_EDITOR, request);
      expect(response.statusCode, request.url).toBe(403);
      expect(response.json().error).toBe("forbidden");
    }
    expect((await as(TEST_EDITOR, { url: "/editor/me" })).json().roles).toEqual(
      ["editor"],
    );
    expect(
      (await as(TEST_EMPLOYEE, { url: "/editor/me" })).json().roles,
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

    expect(employee.roles).toEqual(["editor", "admin"]);
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
