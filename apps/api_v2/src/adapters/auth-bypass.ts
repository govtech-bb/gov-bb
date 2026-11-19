import { z } from "zod";
import type { Database } from "../db";
import { ROLES, UserId, type Employee } from "../modules/auth";
import { err, ok, type Result } from "../modules/result";
import type { AuthHandler } from "../routes/auth";
import { authUser } from "../schema";
import type { EmployeeGate } from "../services/editor-access";

/** Who every editor request runs as while AUTH_BYPASS is on: every role, so one developer can try every flow. */
export const BYPASS_EMPLOYEE: Employee = {
  id: UserId.parse("local-developer"),
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

/** Drizzle wraps the driver's error, so the SQLSTATE is on the cause. */
const uniqueViolation = z.object({
  cause: z.object({ code: z.literal("23505") }),
});

/** Why the bypass developer could not be made a user, safe to log. */
export class BypassRegistrationFailed extends Error {
  /** Stable startup failure category. */
  readonly _tag = "BypassRegistrationFailed" as const;

  /** `email_taken`: another user has the developer's email. */
  constructor(
    readonly reason: "email_taken" | "storage_unavailable",
    cause: unknown,
  ) {
    super(
      reason === "email_taken"
        ? `Another user already has ${BYPASS_EMPLOYEE.email}, so the local developer cannot be registered.`
        : "The local developer could not be registered.",
      { cause },
    );
  }
}

/**
 * Make the bypass developer a user, as the history's `actor` key requires
 * of whoever writes. Only an existing developer is skipped: another user with
 * the same email is refused, so startup stops rather than every write after
 * it. Replaced by a real local session in #3342.
 */
export async function registerBypassEmployee(
  db: Database,
): Promise<Result<void, BypassRegistrationFailed>> {
  try {
    await db
      .insert(authUser)
      .values({
        id: BYPASS_EMPLOYEE.id,
        email: BYPASS_EMPLOYEE.email,
        name: BYPASS_EMPLOYEE.name,
        emailVerified: true,
      })
      .onConflictDoNothing({ target: authUser.id });
    return ok(undefined);
  } catch (cause) {
    const taken = uniqueViolation.safeParse(cause).success;
    return err(
      new BypassRegistrationFailed(
        taken ? "email_taken" : "storage_unavailable",
        cause,
      ),
    );
  }
}
