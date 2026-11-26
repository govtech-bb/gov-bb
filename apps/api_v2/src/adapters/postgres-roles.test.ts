import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db";
import {
  createTestDb,
  expectOk,
  registerEmployees,
  TEST_EDITOR,
} from "../test-db";
import { PostgresRoles } from "./postgres-roles";

describe("a stored role this build doesn't know", () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    await registerEmployees(db, [TEST_EDITOR]);
    // A role a later release added, read by this one after a rollback.
    await db.execute(
      sql`alter table user_roles drop constraint user_roles_role_check`,
    );
    await db.execute(
      sql`insert into user_roles (user_id, role) values (${TEST_EDITOR.id}, 'superuser')`,
    );
  });

  afterEach(() => close());

  it("is left out of the employee's roles", async () => {
    expect(
      expectOk(await new PostgresRoles(db).rolesOf(TEST_EDITOR.id)),
    ).toEqual(["editor"]);
  });

  it("is left out of the list of employees", async () => {
    const employees = expectOk(await new PostgresRoles(db).employees());

    expect(
      employees.find((employee) => employee.id === TEST_EDITOR.id)?.roles,
    ).toEqual(["editor"]);
  });
});
