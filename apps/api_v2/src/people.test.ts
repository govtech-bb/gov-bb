import { sql } from "drizzle-orm";
import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";
import { PostgresRoles } from "./adapters/postgres-roles";
import type { Database } from "./db";
import {
  DefaultRoleChange,
  EmailNotAllowed,
  OwnRoleChange,
  UserId,
  UserNotFound,
  WaitingRoleNotFound,
  type Employee,
} from "./modules/auth";
import { PermissionDenied } from "./modules/permissions";
import {
  createTestDb,
  expectOk,
  registerEmployees,
  TEST_EDITOR,
  TEST_EMPLOYEE,
} from "./test-db";
import { Redacted } from "./modules/redacted";
import { ok } from "./modules/result";
import { EditorAccess } from "./services/editor-access";
import { People } from "./services/people";

let db: Database;
let close: () => Promise<void>;
let people: People;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  // TEST_EMPLOYEE holds every role, admin included; TEST_EDITOR only edits.
  await registerEmployees(db, [TEST_EMPLOYEE, TEST_EDITOR]);
  people = new People(new PostgresRoles(db), ["govtech.bb"]);
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
    const { employees } = expectOk(await people.list(TEST_EMPLOYEE));

    expect(employees.map(({ id, roles }) => ({ id, roles }))).toEqual([
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
    // A real user: the audit history names who took the role away
    await db.execute(
      sql`insert into auth_user (id, name, email, "emailVerified")
          values (${other.id}, 'Other admin', 'other-admin@govtech.bb', true)`,
    );

    expectOk(await people.revoke(TEST_EMPLOYEE.id, "admin", other));

    expect(await stored()).not.toContainEqual(
      expect.objectContaining({ user_id: TEST_EMPLOYEE.id, role: "admin" }),
    );
  });
});

describe("a role given by email before a first sign-in", () => {
  const NEWCOMER: Employee = {
    id: UserId.parse("newcomer-test"),
    email: "newcomer@govtech.bb",
    name: "Test newcomer",
    roles: [],
  };
  const waiting = async () =>
    (
      await db.execute(
        sql`select email, role, granted_by from waiting_roles order by email, role`,
      )
    ).rows;

  it("waits, lowercased, in the list, until it's taken away", async () => {
    const given = expectOk(
      await people.giveByEmail("NewComer@GovTech.bb", "editor", TEST_EMPLOYEE),
    );

    expect(given).toEqual({
      id: expect.any(String),
      email: "newcomer@govtech.bb",
      role: "editor",
    });
    expect(expectOk(await people.list(TEST_EMPLOYEE)).waiting).toEqual([given]);
    // A second time leaves it as it was
    expect(
      expectOk(
        await people.giveByEmail(
          "newcomer@govtech.bb",
          "editor",
          TEST_EMPLOYEE,
        ),
      ),
    ).toEqual(given);

    expectOk(await people.takeWaiting(given.id, TEST_EMPLOYEE));
    const again = await people.takeWaiting(given.id, TEST_EMPLOYEE);

    assert(!again.ok);
    expect(again.error).toBeInstanceOf(WaitingRoleNotFound);
    expect(await waiting()).toEqual([]);
  });

  it("refuses the default role, an address that can't sign in, and someone without people:manage, keeping nothing", async () => {
    const reader = await people.giveByEmail(
      "newcomer@govtech.bb",
      "reader",
      TEST_EMPLOYEE,
    );
    const elsewhere = await people.giveByEmail(
      "someone@example.com",
      "editor",
      TEST_EMPLOYEE,
    );
    const byEditor = await people.giveByEmail(
      "newcomer@govtech.bb",
      "editor",
      TEST_EDITOR,
    );

    assert(!reader.ok);
    expect(reader.error).toBeInstanceOf(DefaultRoleChange);
    assert(!elsewhere.ok);
    expect(elsewhere.error).toBeInstanceOf(EmailNotAllowed);
    // The address is personal data: the reason never repeats it
    expect(elsewhere.error.message).toBe(
      "Give a role only to an address on govtech.bb, which can sign in.",
    );
    assert(!byEditor.ok);
    expect(byEditor.error).toMatchObject({ permission: "people:manage" });
    expect(await waiting()).toEqual([]);
  });

  it("becomes the person's with their first request, beside Reader, recording who gave it", async () => {
    expectOk(
      await people.giveByEmail(
        "newcomer@govtech.bb",
        "approver",
        TEST_EMPLOYEE,
      ),
    );
    await registerEmployees(db, [NEWCOMER]);
    const access = new EditorAccess(
      { findSession: async () => ok(NEWCOMER) },
      new PostgresRoles(db),
    );

    const employee = expectOk(
      await access.requireEmployee(new Redacted("cookie")),
    );

    expect(employee.roles).toEqual(["reader", "approver"]);
    expect(await waiting()).toEqual([]);
    expect(await stored()).toContainEqual({
      user_id: NEWCOMER.id,
      role: "approver",
      granted_by: TEST_EMPLOYEE.id,
    });
  });

  it("is given once when two first requests arrive together, and neither fails", async () => {
    expectOk(
      await people.giveByEmail("newcomer@govtech.bb", "editor", TEST_EMPLOYEE),
    );
    expectOk(
      await people.giveByEmail(
        "newcomer@govtech.bb",
        "approver",
        TEST_EMPLOYEE,
      ),
    );
    await registerEmployees(db, [NEWCOMER]);
    const access = () =>
      new EditorAccess(
        { findSession: async () => ok(NEWCOMER) },
        new PostgresRoles(db),
      ).requireEmployee(new Redacted("cookie"));

    const [first, second] = await Promise.all([access(), access()]);

    expect(first.ok && second.ok).toBe(true);
    expect(
      (await stored()).filter((row) => row.user_id === NEWCOMER.id),
    ).toEqual([
      { user_id: NEWCOMER.id, role: "approver", granted_by: TEST_EMPLOYEE.id },
      { user_id: NEWCOMER.id, role: "editor", granted_by: TEST_EMPLOYEE.id },
    ]);
    expect(await waiting()).toEqual([]);
  });
});
