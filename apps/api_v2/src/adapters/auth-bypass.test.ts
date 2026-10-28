import { describe, expect, it } from "vitest";
import { creationOf, withDefaults } from "../modules/page";
import { authUser } from "../schema";
import { aPage, createTestDb, expectOk } from "../test-db";
import { BYPASS_EMPLOYEE, registerBypassEmployee } from "./auth-bypass";
import { PostgresPages } from "./postgres-pages";

describe("registerBypassEmployee", () => {
  it("lets the bypass developer write, however often it runs", async () => {
    const { db, close } = await createTestDb();
    try {
      expectOk(await registerBypassEmployee(db));
      expectOk(await registerBypassEmployee(db));

      const created = await new PostgresPages(db).atomically(
        BYPASS_EMPLOYEE.id,
        (records) =>
          records.insert(
            creationOf(undefined, withDefaults(aPage()), new Date()),
          ),
      );

      expect(expectOk(created).url).toBe(aPage().url);
    } finally {
      await close();
    }
  });

  it("refuses, saying why, when another user already has the developer's email", async () => {
    const { db, close } = await createTestDb();
    try {
      await db.insert(authUser).values({
        id: "someone-else",
        name: "Someone else",
        email: BYPASS_EMPLOYEE.email,
        emailVerified: true,
      });

      const registered = await registerBypassEmployee(db);

      expect(registered).toMatchObject({
        ok: false,
        error: { _tag: "BypassRegistrationFailed", reason: "email_taken" },
      });
    } finally {
      await close();
    }
  });
});
