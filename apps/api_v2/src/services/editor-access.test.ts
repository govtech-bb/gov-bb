import { describe, expect, it } from "vitest";
import { AuthUnavailable, Forbidden, Unauthenticated } from "../modules/auth";
import { Redacted } from "../modules/redacted";
import { err, ok } from "../modules/result";
import { EditorAccess } from "./editor-access";

describe("editor access", () => {
  it("rejects absent credentials without calling the session dependency", async () => {
    const access = new EditorAccess({
      async findSession(): Promise<never> {
        throw new Error("Unexpected session read");
      },
    });
    const result = await access.requireEmployee(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Unauthenticated);
  });
  it("rejects missing, expired and revoked sessions", async () => {
    const result = await new EditorAccess({
      async findSession() {
        return ok(null);
      },
    }).requireEmployee(new Redacted("session=expired"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Unauthenticated);
  });
  it("preserves denial and dependency failure without granting access", async () => {
    for (const failure of [new Forbidden(), new AuthUnavailable()]) {
      expect(
        await new EditorAccess({
          async findSession() {
            return err(failure);
          },
        }).requireEmployee(new Redacted("cookie")),
      ).toEqual(err(failure));
    }
  });
  it("returns the verified employee from the injected session capability", async () => {
    const employee = {
      id: "employee-id",
      email: "employee@govtech.bb",
      name: "Employee",
    };
    expect(
      await new EditorAccess({
        async findSession() {
          return ok(employee);
        },
      }).requireEmployee(new Redacted("cookie")),
    ).toEqual(ok(employee));
  });
});
