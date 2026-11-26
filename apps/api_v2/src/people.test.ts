import { sql } from "drizzle-orm";
import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";
import { PostgresRoles } from "./adapters/postgres-roles";
import type { Database } from "./db";
import {
  DefaultRoleChange,
  OwnRoleChange,
  UserId,
  UserNotFound,
} from "./modules/auth";
import { PermissionDenied } from "./modules/permissions";
import {
  createTestDb,
  expectOk,
  registerEmployees,
  TEST_EDITOR,
  TEST_EMPLOYEE,
} from "./test-db";
import { People } from "./services/people";

let db: Database;
let close: () => Promise<void>;
let people: People;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  // TEST_EMPLOYEE holds every role, admin included; TEST_EDITOR only edits.
  await registerEmployees(db, [TEST_EMPLOYEE, TEST_EDITOR]);
  people = new People(new PostgresRoles(db));
});

afterEach(() => close());

const stored = async () =>
  (
    await db.execute(
      sql`select user_id, role, granted_by from user_roles order by user_id, role`,
    )
  ).rows;

describe("list", () => {
  it("shows everyone with the default role first, to someone with people:read", async () => {
    const listed = expectOk(await people.list(TEST_EMPLOYEE));

    expect(listed.map(({ id, roles }) => ({ id, roles }))).toEqual([
      { id: TEST_EDITOR.id, roles: ["reader", "editor"] },
      {
        id: TEST_EMPLOYEE.id,
        roles: ["reader", "admin", "approver", "editor"],
      },
    ]);
  });

  it("refuses someone without people:read", async () => {
    const refused = await people.list(TEST_EDITOR);

    assert(!refused.ok);
    expect(refused.error).toBeInstanceOf(PermissionDenied);
    expect(refused.error).toMatchObject({ permission: "people:read" });
  });
});

describe("grant", () => {
  it("stores the role with who gave it", async () => {
    expectOk(await people.grant(TEST_EDITOR.id, "approver", TEST_EMPLOYEE));

    expect(await stored()).toContainEqual({
      user_id: TEST_EDITOR.id,
      role: "approver",
      granted_by: TEST_EMPLOYEE.id,
    });
  });

  it("refuses the default role, someone without people:manage, and a user who never signed in, writing nothing", async () => {
    const before = await stored();

    const reader = await people.grant(TEST_EDITOR.id, "reader", TEST_EMPLOYEE);
    const byEditor = await people.grant(TEST_EDITOR.id, "admin", TEST_EDITOR);
    const nobody = await people.grant("nobody", "editor", TEST_EMPLOYEE);

    assert(!reader.ok);
    expect(reader.error).toBeInstanceOf(DefaultRoleChange);
    expect(reader.error.message).toBe(
      "Everyone has the reader role. It can't be given or taken away.",
    );
    assert(!byEditor.ok);
    expect(byEditor.error).toMatchObject({ permission: "people:manage" });
    assert(!nobody.ok);
    expect(nobody.error).toBeInstanceOf(UserNotFound);
    expect(await stored()).toEqual(before);
  });
});

describe("revoke", () => {
  it("takes the role away", async () => {
    expectOk(await people.revoke(TEST_EDITOR.id, "editor", TEST_EMPLOYEE));

    expect(await stored()).not.toContainEqual(
      expect.objectContaining({ user_id: TEST_EDITOR.id, role: "editor" }),
    );
  });

  it("lets an admin take away their own other roles", async () => {
    expectOk(await people.revoke(TEST_EMPLOYEE.id, "approver", TEST_EMPLOYEE));

    expect(await stored()).not.toContainEqual(
      expect.objectContaining({ user_id: TEST_EMPLOYEE.id, role: "approver" }),
    );
  });

  it("refuses the actor's own admin role, the default role, and someone without people:manage, writing nothing", async () => {
    const before = await stored();

    const ownAdmin = await people.revoke(
      TEST_EMPLOYEE.id,
      "admin",
      TEST_EMPLOYEE,
    );
    const reader = await people.revoke(TEST_EDITOR.id, "reader", TEST_EMPLOYEE);
    const byEditor = await people.revoke(
      TEST_EMPLOYEE.id,
      "admin",
      TEST_EDITOR,
    );

    assert(!ownAdmin.ok);
    expect(ownAdmin.error).toBeInstanceOf(OwnRoleChange);
    assert(!reader.ok);
    expect(reader.error).toBeInstanceOf(DefaultRoleChange);
    assert(!byEditor.ok);
    expect(byEditor.error).toMatchObject({ permission: "people:manage" });
    expect(await stored()).toEqual(before);
  });

  it("lets another admin take an admin role away", async () => {
    const other = { ...TEST_EMPLOYEE, id: UserId.parse("other-admin") };

    expectOk(await people.revoke(TEST_EMPLOYEE.id, "admin", other));

    expect(await stored()).not.toContainEqual(
      expect.objectContaining({ user_id: TEST_EMPLOYEE.id, role: "admin" }),
    );
  });
});
