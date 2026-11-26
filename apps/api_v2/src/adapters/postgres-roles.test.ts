import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createTestDb,
  expectOk,
  registerEmployees,
  TEST_EDITOR,
} from "../test-db";
import { PostgresRoles } from "./postgres-roles";

describe("PostgresRoles.rolesOf", () => {
  it("leaves out a stored role this build doesn't know", async () => {
    const { db, close } = await createTestDb();
    try {
      await registerEmployees(db, [TEST_EDITOR]);
      // A role a later release added, read by this one after a rollback.
      await db.execute(
        sql`alter table user_roles drop constraint user_roles_role_check`,
      );
      await db.execute(
        sql`insert into user_roles (user_id, role) values (${TEST_EDITOR.id}, 'superuser')`,
      );

      expect(
        expectOk(await new PostgresRoles(db).rolesOf(TEST_EDITOR.id)),
      ).toEqual(["editor"]);
    } finally {
      await close();
    }
  });
});
