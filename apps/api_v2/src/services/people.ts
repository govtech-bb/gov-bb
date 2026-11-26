import {
  DefaultRoleChange,
  EmailNotAllowed,
  OwnRoleChange,
  WaitingRoleNotFound,
  type Employee,
  type EmployeeView,
  type UserNotFound,
  type WaitingRoleView,
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
  /** Roles given by email to people who haven't signed in yet, by email. */
  waiting(): Promise<Result<WaitingRoleView[], ContentStoreUnavailable>>;
  /** Keep a role for a lowercased email until its first sign-in; one already waiting stays as it was. */
  addWaiting(
    email: string,
    role: GrantableRole,
    grantedBy: string,
  ): Promise<Result<WaitingRoleView, ContentStoreUnavailable>>;
  /** Take a waiting role away; false when it wasn't there. */
  removeWaiting(id: string): Promise<Result<boolean, ContentStoreUnavailable>>;
}

/** Everyone who has signed in, and the roles waiting for people who haven't. */
export interface PeopleList {
  readonly employees: EmployeeView[];
  readonly waiting: WaitingRoleView[];
}

/** Who has signed in, the roles they hold, and the rules for changing them, without HTTP or database types. */
export interface IPeople {
  /** Everyone who has signed in, each with the default role first, and the roles waiting for people who haven't. */
  list(
    actor: Employee,
  ): Promise<Result<PeopleList, PermissionDenied | ContentStoreUnavailable>>;
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
  /** Give a role by email to someone who hasn't signed in yet; it applies from their first request. */
  giveByEmail(
    email: string,
    role: Role,
    actor: Employee,
  ): Promise<
    Result<
      WaitingRoleView,
      | PermissionDenied
      | DefaultRoleChange
      | EmailNotAllowed
      | ContentStoreUnavailable
    >
  >;
  /** Take away a role that is still waiting for its person's first sign-in. */
  takeWaiting(
    id: string,
    actor: Employee,
  ): Promise<
    Result<
      void,
      PermissionDenied | WaitingRoleNotFound | ContentStoreUnavailable
    >
  >;
}

/** The rules for roles: who may see and change them, and the changes nobody may make. */
export class People implements IPeople {
  /** The root supplies role storage, and the domains sign-in admits, which a role given by email must be on. */
  constructor(
    private readonly records: PeopleRecords,
    private readonly allowedDomains: readonly string[],
  ) {}

  async list(
    actor: Employee,
  ): Promise<Result<PeopleList, PermissionDenied | ContentStoreUnavailable>> {
    const grant = authorize(actor, "people:read");
    if (!grant.ok) return grant;
    const employees = await this.records.employees();
    if (!employees.ok) return employees;
    const waiting = await this.records.waiting();
    return waiting.ok
      ? ok({
          employees: employees.value.map((employee) => ({
            ...employee,
            roles: [DEFAULT_ROLE, ...employee.roles],
          })),
          waiting: waiting.value,
        })
      : waiting;
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

  async giveByEmail(
    email: string,
    role: Role,
    actor: Employee,
  ): Promise<
    Result<
      WaitingRoleView,
      | PermissionDenied
      | DefaultRoleChange
      | EmailNotAllowed
      | ContentStoreUnavailable
    >
  > {
    const grant = authorize(actor, "people:manage");
    if (!grant.ok) return grant;
    if (role === DEFAULT_ROLE) return err(new DefaultRoleChange());
    // As sign-in admits it: lowercased, on an allowed domain
    const address = email.toLowerCase();
    if (!this.allowedDomains.includes(address.slice(address.indexOf("@") + 1)))
      return err(new EmailNotAllowed(this.allowedDomains));
    return this.records.atomically(grant.value, (records) =>
      records.addWaiting(address, role, grant.value.actor),
    );
  }

  async takeWaiting(
    id: string,
    actor: Employee,
  ): Promise<
    Result<
      void,
      PermissionDenied | WaitingRoleNotFound | ContentStoreUnavailable
    >
  > {
    const grant = authorize(actor, "people:manage");
    if (!grant.ok) return grant;
    return this.records.atomically(grant.value, async (records) => {
      const removed = await records.removeWaiting(id);
      if (!removed.ok) return removed;
      return removed.value ? ok(undefined) : err(new WaitingRoleNotFound());
    });
  }
}
