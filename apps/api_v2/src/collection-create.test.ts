/**
 * Creating a data collection (#3681): an admin or an approver adds one, every
 * rule a definition breaks is refused naming its field, nothing is written
 * when it is, and the new collection takes records at once.
 */

import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UserId, type Employee, type Role } from "./modules/auth";
import { ok } from "./modules/result";
import {
  createTestApp,
  createTestDb,
  TEST_EDITOR,
  TEST_HEADERS,
  type TestDb,
} from "./test-db";

let test: TestDb;
const apps: FastifyInstance[] = [];

beforeEach(async () => {
  test = await createTestDb();
});
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  await test.close();
});

/** A signed-in employee holding only `role`, as an admin's grants would leave them. */
async function holding(role: Role): Promise<Employee> {
  const employee: Employee = {
    id: UserId.parse(`${role}-only-test`),
    email: `${role}-only@govtech.bb`,
    name: `Test ${role} only`,
    roles: [role],
  };
  await test.db.execute(
    sql`insert into auth_user (id, name, email, "emailVerified")
        values (${employee.id}, ${employee.name}, ${employee.email}, true)
        on conflict do nothing`,
  );
  await test.db.execute(
    sql`insert into user_roles (user_id, role) values (${employee.id}, ${role})
        on conflict do nothing`,
  );
  return employee;
}

async function signedIn(employee: Employee) {
  const app = await createTestApp(test.db, {
    sessions: { findSession: async () => ok(employee) },
  });
  apps.push(app);
  return app;
}

const OFFICES = {
  key: "offices",
  title: "Offices",
  record_key: "key",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "name", label: "Name", type: "text" },
      { key: "email", label: "Email", type: "email" },
    ],
  },
};

const createAs = async (employee: Employee, payload: object = OFFICES) =>
  (await signedIn(employee)).inject({
    method: "POST",
    url: "/collections",
    payload,
    headers: TEST_HEADERS,
  });

/** What a refusal must leave as it was. */
const written = async () =>
  (
    await test.db.execute(
      sql`select (select count(*)::int from data_collections) as collections,
                 (select count(*)::int from change_events) as events`,
    )
  ).rows[0];

describe("who can create a collection", () => {
  it.each(["admin", "approver"] as const)(
    "lets an employee with only the %s role create one, recorded against them",
    async (role) => {
      const employee = await holding(role);
      const response = await createAs(employee);
      expect(response.statusCode, response.body).toBe(201);
      expect(response.json()).toEqual({
        ...OFFICES,
        schema_version: 1,
        updated_at: expect.any(String),
      });
      expect(
        (
          await test.db.execute(
            sql`select entity_kind, action, actor from change_events`,
          )
        ).rows,
      ).toEqual([
        {
          entity_kind: "data_collection",
          action: "created",
          actor: employee.id,
        },
      ]);
    },
  );

  it("refuses an editor, naming the roles it needs, and writes nothing", async () => {
    expect(TEST_EDITOR.roles).toEqual(["editor"]);
    const before = await written();
    const response = await createAs(TEST_EDITOR);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "forbidden",
      message: "You need the admin or approver role to do this.",
    });
    expect(await written()).toEqual(before);
  });
});

describe("the rules a new collection must keep", () => {
  const refusals: [string, object, string][] = [
    ["a key in the wrong format", { key: "Offices!" }, "key"],
    ["no title", { title: "  " }, "title"],
    ["an empty field list", { schema: { fields: [] } }, "schema.fields"],
    [
      "a duplicate field key",
      {
        schema: {
          fields: [
            { key: "key", label: "Key", type: "slug" },
            { key: "key", label: "Again", type: "text" },
          ],
        },
      },
      "schema.fields.1.key",
    ],
    [
      "a field without a label",
      {
        schema: {
          fields: [
            { key: "key", label: "Key", type: "slug" },
            { key: "name", label: "", type: "text" },
          ],
        },
      },
      "schema.fields.1.label",
    ],
    [
      "an unknown field type",
      {
        schema: {
          fields: [
            { key: "key", label: "Key", type: "slug" },
            { key: "details", label: "Details", type: "json" },
          ],
        },
      },
      "schema.fields.1.type",
    ],
    ...["__proto__", "phone,email", "has space", "Name", " key"].map(
      (key): [string, object, string] => [
        `a field key in the wrong format (${JSON.stringify(key)})`,
        {
          schema: {
            fields: [
              { key: "key", label: "Key", type: "slug" },
              { key, label: "Odd", type: "text" },
            ],
          },
        },
        "schema.fields.1.key",
      ],
    ),
    ["a title with a NUL", { title: "Off\u0000ices" }, "title"],
    [
      "a label with a NUL",
      {
        schema: {
          fields: [{ key: "key", label: "K\u0000ey", type: "slug" }],
        },
      },
      "schema.fields.0.label",
    ],
    ["a record key that isn't a field", { record_key: "code" }, "record_key"],
    [
      "a record key that isn't a slug field",
      { record_key: "name" },
      "record_key",
    ],
  ];

  it.each(refusals)(
    "refuses %s, naming the field, and writes nothing",
    async (_, change, field) => {
      const admin = await holding("admin");
      const before = await written();
      const response = await createAs(admin, { ...OFFICES, ...change });
      expect(response.statusCode, response.body).toBe(422);
      expect(response.json()).toEqual({
        error: "validation_failed",
        message: expect.any(String),
        errors: [{ field, message: expect.any(String) }],
      });
      expect(await written()).toEqual(before);
    },
  );

  it("refuses a key another collection has with a 409 naming the key, and writes nothing", async () => {
    const admin = await holding("admin");
    expect((await createAs(admin)).statusCode).toBe(201);
    const before = await written();
    const response = await createAs(admin, { ...OFFICES, title: "Again" });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "collection_exists",
      message: "There is already a collection offices.",
      errors: [
        { field: "key", message: "There is already a collection offices." },
      ],
    });
    expect(await written()).toEqual(before);
  });

  it("refuses a body without a field list before it reaches the rules", async () => {
    const admin = await holding("admin");
    const { schema: _, ...missing } = OFFICES;
    const response = await createAs(admin, missing);
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/schema/);
  });
});

it("takes records through the record routes as soon as it is created", async () => {
  const approver = await holding("approver");
  expect((await createAs(approver)).statusCode).toBe(201);
  // TEST_EMPLOYEE, the default session, holds the editor role records need
  const app = await createTestApp(test.db);
  apps.push(app);
  const added = await app.inject({
    method: "POST",
    url: "/collections/offices/records/north",
    payload: { data: { name: "North office", email: "north@example.gov.bb" } },
    headers: TEST_HEADERS,
  });
  expect(added.statusCode, added.body).toBe(201);
  expect(added.json().data).toEqual({
    key: "north",
    name: "North office",
    email: "north@example.gov.bb",
  });
  const listed = await app.inject({
    url: "/collections",
    headers: TEST_HEADERS,
  });
  expect(
    listed
      .json()
      .collections.map(
        ({ key, record_count }: { key: string; record_count: number }) => ({
          key,
          record_count,
        }),
      ),
  ).toEqual([{ key: "offices", record_count: 1 }]);
});
