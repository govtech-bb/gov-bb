/**
 * Role storage in PostgreSQL: `user_roles`, a row per role an employee holds.
 * Failures become `ContentStoreUnavailable`, the driver's error kept only as
 * its cause.
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db";
import { EmployeeView, UserNotFound, WaitingRoleView } from "../modules/auth";
import { GrantableRole, type Grant } from "../modules/permissions";
import { ContentStoreUnavailable } from "../modules/page";
import { err, ok, type Result } from "../modules/result";
import { userRoles, waitingRoles } from "../schema";
import type { RoleRecords } from "../services/editor-access";
import type { PeopleRecords } from "../services/people";
import { transactAs } from "./postgres-transaction";

/** Drizzle wraps the driver's error, so the SQLSTATE is on the cause. */
const missingUser = z.object({ cause: z.object({ code: z.literal("23503") }) });

/** Stored role names this build knows; a role a later release added is left out. */
function knownRoles(names: readonly string[]): GrantableRole[] {
  return names.flatMap((name) => {
    const role = GrantableRole.safeParse(name);
    return role.success ? [role.data] : [];
  });
}

/** An employee as stored, with only the roles this build knows. */
const storedEmployee = EmployeeView.extend({
  roles: z.array(z.string()).transform(knownRoles),
});

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
export class PostgresRoles implements RoleRecords, PeopleRecords {
  /** The process's database handle. */
  constructor(private readonly db: Database) {}

  /**
   * Run `work` in one transaction with the grant's actor as `app.user_id`;
   * an error result rolls back everything it wrote. No trigger on
   * `user_roles` reads `app.user_id` yet, so only a grant's `granted_by`
   * records who made a change.
   */
  async atomically<R extends Result<unknown, Error>>(
    grant: Grant<"people:manage">,
    work: (records: PostgresRoles) => Promise<R>,
  ): Promise<R | Result<never, ContentStoreUnavailable>> {
    return transactAs(this.db, grant.actor, { contentLock: false }, (tx) =>
      work(new PostgresRoles(tx)),
    );
  }

  /** The user's roles, leaving out a stored name this build doesn't know. */
  async rolesOf(
    userId: string,
  ): Promise<Result<GrantableRole[], ContentStoreUnavailable>> {
    const rows = await attempt("rolesOf", () =>
      this.db
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, userId))
        .orderBy(userRoles.role),
    );
    return rows.ok ? ok(knownRoles(rows.value.map((row) => row.role))) : rows;
  }

  /** Grant a role; one already held keeps its first grantor. */
  async grant(
    userId: string,
    role: GrantableRole,
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
    role: GrantableRole,
  ): Promise<Result<void, ContentStoreUnavailable>> {
    const deleted = await attempt("revoke", () =>
      this.db
        .delete(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role))),
    );
    return deleted.ok ? ok(undefined) : deleted;
  }

  /**
   * Move the roles waiting for this email to the user, in one statement: the
   * delete hands each waiting row to one request only, and user_roles' key
   * keeps a role the user holds already from being granted twice.
   */
  async claimWaiting(
    userId: string,
    email: string,
  ): Promise<Result<void, ContentStoreUnavailable>> {
    const claimed = await attempt("claimWaiting", () =>
      this.db.execute(sql`
        with claimed as (
          delete from waiting_roles where email = ${email}
          returning role, granted_by, granted_at
        )
        insert into user_roles (user_id, role, granted_by, granted_at)
        select ${userId}, role, granted_by, granted_at from claimed
        on conflict do nothing`),
    );
    return claimed.ok ? ok(undefined) : claimed;
  }

  /** Roles given by email to people who haven't signed in yet, by email, leaving out a role this build doesn't know. */
  async waiting(): Promise<Result<WaitingRoleView[], ContentStoreUnavailable>> {
    const rows = await attempt("waiting", () =>
      this.db
        .select({
          id: waitingRoles.id,
          email: waitingRoles.email,
          role: waitingRoles.role,
        })
        .from(waitingRoles)
        .orderBy(sql`${waitingRoles.email} collate "C"`, waitingRoles.role),
    );
    return rows.ok
      ? ok(
          rows.value.flatMap((row) => {
            const known = WaitingRoleView.safeParse(row);
            return known.success ? [known.data] : [];
          }),
        )
      : rows;
  }

  /** Keep a role for an email until its first sign-in; one already waiting keeps its first giver. */
  async addWaiting(
    email: string,
    role: GrantableRole,
    grantedBy: string,
  ): Promise<Result<WaitingRoleView, ContentStoreUnavailable>> {
    const rows = await attempt("addWaiting", async () => {
      await this.db
        .insert(waitingRoles)
        .values({ email, role, grantedBy })
        .onConflictDoNothing();
      return this.db
        .select({
          id: waitingRoles.id,
          email: waitingRoles.email,
          role: waitingRoles.role,
        })
        .from(waitingRoles)
        .where(and(eq(waitingRoles.email, email), eq(waitingRoles.role, role)));
    });
    return rows.ok ? ok(WaitingRoleView.parse(rows.value[0])) : rows;
  }

  /** Take a waiting role away; false when it wasn't there. */
  async removeWaiting(
    id: string,
  ): Promise<Result<boolean, ContentStoreUnavailable>> {
    const removed = await attempt("removeWaiting", () =>
      this.db
        .delete(waitingRoles)
        .where(eq(waitingRoles.id, id))
        .returning({ id: waitingRoles.id }),
    );
    return removed.ok ? ok(removed.value.length > 0) : removed;
  }

  /** Everyone who has signed in, with the roles this build knows, by email. */
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
        -- Byte order, so the list reads the same whatever the database's locale.
        order by u.email collate "C"`),
    );
    return rows.ok ? ok(z.array(storedEmployee).parse(rows.value.rows)) : rows;
  }
}
