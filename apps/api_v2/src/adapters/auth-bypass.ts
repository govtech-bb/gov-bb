import type { Database } from "../db";
import type { Employee } from "../modules/auth";
import { ok } from "../modules/result";
import type { AuthHandler } from "../routes/auth";
import { authUser } from "../schema";
import type { EmployeeGate } from "../services/editor-access";

/** Who every editor request runs as while AUTH_BYPASS is on. */
export const BYPASS_EMPLOYEE: Employee = {
  id: "local-developer",
  email: "developer@localhost",
  name: "Local developer",
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
 * of whoever writes. Replaced by a real local session in #3342.
 */
export async function registerBypassEmployee(db: Database): Promise<void> {
  await db
    .insert(authUser)
    .values({ ...BYPASS_EMPLOYEE, emailVerified: true })
    .onConflictDoNothing();
}
