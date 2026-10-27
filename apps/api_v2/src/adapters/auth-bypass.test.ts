import { describe, expect, it } from "vitest";
import { creationOf, withDefaults } from "../modules/page";
import { aPage, createTestDb, expectOk } from "../test-db";
import { BYPASS_EMPLOYEE, registerBypassEmployee } from "./auth-bypass";
import { PostgresPages } from "./postgres-pages";

describe("registerBypassEmployee", () => {
  it("lets the bypass developer write, however often it runs", async () => {
    const { db, close } = await createTestDb();
    try {
      await registerBypassEmployee(db);
      await registerBypassEmployee(db);

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
});
