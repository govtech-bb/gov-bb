import { describe, expect, it } from "vitest";
import {
  AuthUnavailable,
  Forbidden,
  Unauthenticated,
  type Role,
} from "../modules/auth";
import { ContentStoreUnavailable } from "../modules/page";
import { Redacted } from "../modules/redacted";
import { err, ok } from "../modules/result";
import { EditorAccess, type RoleRecords } from "./editor-access";

/** Role storage holding `held`, recording what is granted. */
function rolesHolding(held: Role[] = []) {
  const granted: { role: Role; grantedBy: string | null }[] = [];
  const records: RoleRecords = {
    rolesOf: async () => ok([...held]),
    grant: async (_userId, role, grantedBy) => {
      granted.push({ role, grantedBy });
      return ok(undefined);
    },
    revoke: async () => ok(undefined),
    employees: async () => ok([]),
  };
  return { records, granted };
}

const employee = {
  id: "employee-id",
  email: "employee@govtech.bb",
  name: "Employee",
};
const signedIn = { findSession: async () => ok(employee) };

describe("editor access", () => {
  it("rejects absent credentials without calling the session dependency", async () => {
    const access = new EditorAccess(
      {
        async findSession(): Promise<never> {
          throw new Error("Unexpected session read");
        },
      },
      rolesHolding().records,
    );
    const result = await access.requireEmployee(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Unauthenticated);
  });
  it("rejects missing, expired and revoked sessions", async () => {
    const result = await new EditorAccess(
      {
        async findSession() {
          return ok(null);
        },
      },
      rolesHolding().records,
    ).requireEmployee(new Redacted("session=expired"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Unauthenticated);
  });
  it("preserves denial and dependency failure without granting access", async () => {
    for (const failure of [new Forbidden(), new AuthUnavailable()]) {
      expect(
        await new EditorAccess(
          {
            async findSession() {
              return err(failure);
            },
          },
          rolesHolding().records,
        ).requireEmployee(new Redacted("cookie")),
      ).toEqual(err(failure));
    }
  });
  it("returns the verified employee with the roles they hold", async () => {
    expect(
      await new EditorAccess(
        signedIn,
        rolesHolding(["approver"]).records,
      ).requireEmployee(new Redacted("cookie")),
    ).toEqual(ok({ ...employee, roles: ["approver"] }));
  });
  it("keeps access closed when the roles cannot be read", async () => {
    const roles = rolesHolding().records;
    roles.rolesOf = async () =>
      err(new ContentStoreUnavailable("rolesOf", new Error("down")));
    expect(
      await new EditorAccess(signedIn, roles).requireEmployee(
        new Redacted("cookie"),
      ),
    ).toEqual(err(new AuthUnavailable()));
  });
  it("makes a listed email an admin, granted by nobody, once", async () => {
    const listed = rolesHolding(["editor"]);
    expect(
      await new EditorAccess(signedIn, listed.records, [
        employee.email,
      ]).requireEmployee(new Redacted("cookie")),
    ).toEqual(ok({ ...employee, roles: ["editor", "admin"] }));
    expect(listed.granted).toEqual([{ role: "admin", grantedBy: null }]);

    const already = rolesHolding(["admin"]);
    await new EditorAccess(signedIn, already.records, [
      employee.email,
    ]).requireEmployee(new Redacted("cookie"));
    expect(already.granted).toEqual([]);
  });
  it("grants nothing to an email that is not listed", async () => {
    const unlisted = rolesHolding();
    await new EditorAccess(signedIn, unlisted.records, [
      "someone-else@govtech.bb",
    ]).requireEmployee(new Redacted("cookie"));
    expect(unlisted.granted).toEqual([]);
  });
});
