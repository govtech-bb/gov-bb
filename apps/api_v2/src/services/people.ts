import {
  DefaultRoleChange,
  OwnRoleChange,
  type Employee,
  type EmployeeView,
  type UserNotFound,
} from "../modules/auth";
import type { ContentStoreUnavailable } from "../modules/page";
import {
  authorize,
  DEFAULT_ROLE,
  permissionsOf,
  type Grant,
  type GrantableRole,
  type PermissionDenied,
  type Role,
} from "../modules/permissions";
import { err, ok, type Result } from "../modules/result";

/** Who holds which stored role. A role change runs in one transaction. */
export interface PeopleRecords {
  /**
   * Run `work` as one transaction, with the grant's actor set as the
   * transaction's actor; a failed Result rolls it back. Only a
   * `people:manage` check opens one. Nothing records that actor for role
   * changes yet: a grant's `granted_by` says who gave it, and a revoke
   * leaves no record of who made it.
   */
  atomically<R extends Result<unknown, Error>>(
    grant: Grant<"people:manage">,
    work: (records: PeopleRecords) => Promise<R>,
  ): Promise<R | Result<never, ContentStoreUnavailable>>;
  /** Everyone who has signed in, with their stored roles, by email. */
  employees(): Promise<Result<EmployeeView[], ContentStoreUnavailable>>;
  /** Grant a role, recording who granted it; holding it already is not an error. */
  grant(
    userId: string,
    role: GrantableRole,
    grantedBy: string | null,
  ): Promise<Result<void, UserNotFound | ContentStoreUnavailable>>;
  /** Revoke a role; not holding it is not an error. */
  revoke(
    userId: string,
    role: GrantableRole,
  ): Promise<Result<void, ContentStoreUnavailable>>;
}

/** Who has signed in, the roles they hold, and the rules for changing them, without HTTP or database types. */
export interface IPeople {
  /** Everyone who has signed in, each with the default role first. */
  list(
    actor: Employee,
  ): Promise<
    Result<EmployeeView[], PermissionDenied | ContentStoreUnavailable>
  >;
  /** Give someone a role. The default role is everyone's already. */
  grant(
    userId: string,
    role: Role,
    actor: Employee,
  ): Promise<
    Result<
      void,
      | PermissionDenied
      | DefaultRoleChange
      | UserNotFound
      | ContentStoreUnavailable
    >
  >;
  /** Take a role away, but not the default role, and not the one that lets the actor give it back. */
  revoke(
    userId: string,
    role: Role,
    actor: Employee,
  ): Promise<
    Result<
      void,
      | PermissionDenied
      | DefaultRoleChange
      | OwnRoleChange
      | ContentStoreUnavailable
    >
  >;
}

/** The rules for roles: who may see and change them, and the changes nobody may make. */
export class People implements IPeople {
  /** The root supplies role storage. */
  constructor(private readonly records: PeopleRecords) {}

  async list(
    actor: Employee,
  ): Promise<
    Result<EmployeeView[], PermissionDenied | ContentStoreUnavailable>
  > {
    const grant = authorize(actor, "people:read");
    if (!grant.ok) return grant;
    const employees = await this.records.employees();
    return employees.ok
      ? ok(
          employees.value.map((employee) => ({
            ...employee,
            roles: [DEFAULT_ROLE, ...employee.roles],
          })),
        )
      : employees;
  }

  async grant(
    userId: string,
    role: Role,
    actor: Employee,
  ): Promise<
    Result<
      void,
      | PermissionDenied
      | DefaultRoleChange
      | UserNotFound
      | ContentStoreUnavailable
    >
  > {
    const grant = authorize(actor, "people:manage");
    if (!grant.ok) return grant;
    if (role === DEFAULT_ROLE) return err(new DefaultRoleChange());
    return this.records.atomically(grant.value, (records) =>
      records.grant(userId, role, grant.value.actor),
    );
  }

  async revoke(
    userId: string,
    role: Role,
    actor: Employee,
  ): Promise<
    Result<
      void,
      | PermissionDenied
      | DefaultRoleChange
      | OwnRoleChange
      | ContentStoreUnavailable
    >
  > {
    const grant = authorize(actor, "people:manage");
    if (!grant.ok) return grant;
    if (role === DEFAULT_ROLE) return err(new DefaultRoleChange());
    // Nobody locks themselves out: another holder of people:manage does it.
    if (
      userId === actor.id &&
      !permissionsOf(actor.roles.filter((held) => held !== role)).includes(
        "people:manage",
      )
    )
      return err(new OwnRoleChange(role));
    return this.records.atomically(grant.value, (records) =>
      records.revoke(userId, role),
    );
  }
}
