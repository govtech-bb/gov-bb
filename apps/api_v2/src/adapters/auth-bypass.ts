import type { Database } from "../db";
import { ROLES, type Employee } from "../modules/auth";
import { ok } from "../modules/result";
import type { AuthHandler } from "../routes/auth";
import { authUser } from "../schema";
import type { EmployeeGate } from "../services/editor-access";

/** Who every editor request runs as while AUTH_BYPASS is on: every role, so one developer can try every flow. */
export const BYPASS_EMPLOYEE: Employee = {
  id: "local-developer",
  email: "developer@localhost",
  name: "Local developer",
  roles: ROLES,
};

/**
 * Local development only (AUTH_BYPASS): no sign-in, no session lookup. The
 * config refuses it in production and for any editor not on this machine.
 */
export const authBypass: {
  access: EmployeeGate;
  auth: AuthHandler;
} = {
  access: { requireEmployee: async () => ok(BYPASS_EMPLOYEE) },
  auth: {
    handle: async () =>
      Response.json({ error: "auth_bypassed" }, { status: 404 }),
  },
};

/**
 * Make the bypass developer a user, as the history's `actor` key requires
 * of whoever writes. Only an existing developer is skipped: another user with
 * the same email fails startup rather than every write after it. Replaced by
 * a real local session in #3342.
 */
export async function registerBypassEmployee(db: Database): Promise<void> {
  await db
    .insert(authUser)
    .values({
      id: BYPASS_EMPLOYEE.id,
      email: BYPASS_EMPLOYEE.email,
      name: BYPASS_EMPLOYEE.name,
      emailVerified: true,
    })
    .onConflictDoNothing({ target: authUser.id });
}
