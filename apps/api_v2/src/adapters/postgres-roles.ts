/**
 * Role storage in PostgreSQL: `user_roles`, a row per role an employee holds.
 * Failures become `ContentStoreUnavailable`, the driver's error kept only as
 * its cause.
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db";
import { EmployeeView, UserNotFound, type Role } from "../modules/auth";
import { ContentStoreUnavailable } from "../modules/page";
import { err, ok, type Result } from "../modules/result";
import { userRoles } from "../schema";
import type { RoleRecords } from "../services/editor-access";

/** Drizzle wraps the driver's error, so the SQLSTATE is on the cause. */
const missingUser = z.object({ cause: z.object({ code: z.literal("23503") }) });

async function attempt<T>(
  operation: string,
  run: () => Promise<T>,
): Promise<Result<T, ContentStoreUnavailable>> {
  try {
    return ok(await run());
  } catch (cause) {
    return err(new ContentStoreUnavailable(operation, cause));
  }
}

/** Who holds which role, in `user_roles`. */
export class PostgresRoles implements RoleRecords {
  /** The process's database handle. */
  constructor(private readonly db: Database) {}

  /** The user's roles. */
  async rolesOf(
    userId: string,
  ): Promise<Result<Role[], ContentStoreUnavailable>> {
    const rows = await attempt("rolesOf", () =>
      this.db
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, userId))
        .orderBy(userRoles.role),
    );
    return rows.ok ? ok(rows.value.map((row) => row.role)) : rows;
  }

  /** Grant a role; one already held keeps its first grantor. */
  async grant(
    userId: string,
    role: Role,
    grantedBy: string | null,
  ): Promise<Result<void, UserNotFound | ContentStoreUnavailable>> {
    try {
      await this.db
        .insert(userRoles)
        .values({ userId, role, grantedBy })
        .onConflictDoNothing();
      return ok(undefined);
    } catch (cause) {
      return err(
        missingUser.safeParse(cause).success
          ? new UserNotFound(userId)
          : new ContentStoreUnavailable("grant", cause),
      );
    }
  }

  /** Revoke a role. */
  async revoke(
    userId: string,
    role: Role,
  ): Promise<Result<void, ContentStoreUnavailable>> {
    const deleted = await attempt("revoke", () =>
      this.db
        .delete(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role))),
    );
    return deleted.ok ? ok(undefined) : deleted;
  }

  /** Everyone who has signed in, with their roles, by email. */
  async employees(): Promise<Result<EmployeeView[], ContentStoreUnavailable>> {
    const rows = await attempt("employees", () =>
      this.db.execute(sql`
        select u.id, u.email, u.name,
               coalesce(
                 array_agg(r.role order by r.role) filter (where r.role is not null),
                 '{}'
               ) as roles
        from auth_user u
        left join user_roles r on r.user_id = u.id
        -- The history's author of last resort; it has no account to sign in with.
        where u.id <> 'system'
        group by u.id
        order by u.email`),
    );
    return rows.ok ? ok(z.array(EmployeeView).parse(rows.value.rows)) : rows;
  }
}
