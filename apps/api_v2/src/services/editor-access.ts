import {
  AuthUnavailable,
  Unauthenticated,
  type Employee,
  type EmployeeView,
  type Forbidden,
  type Identity,
  type Role,
  type UserNotFound,
} from "../modules/auth";
import type { ContentStoreUnavailable } from "../modules/page";
import type { Redacted } from "../modules/redacted";
import { err, ok, type Result } from "../modules/result";

/** The only session capability required to authorize editor access. */
export interface SessionReader {
  /** Verify the opaque browser credential and return its admitted user. */
  findSession(
    credential: Redacted<string>,
  ): Promise<Result<Identity | null, Forbidden | AuthUnavailable>>;
}

/** Who holds which role, a row each. */
export interface RoleRecords {
  /** The user's roles, none when they hold none. */
  rolesOf(userId: string): Promise<Result<Role[], ContentStoreUnavailable>>;
  /** Grant a role, recording who granted it (null for api_v2 itself); holding it already is not an error. */
  grant(
    userId: string,
    role: Role,
    grantedBy: string | null,
  ): Promise<Result<void, UserNotFound | ContentStoreUnavailable>>;
  /** Revoke a role; not holding it is not an error. */
  revoke(
    userId: string,
    role: Role,
  ): Promise<Result<void, ContentStoreUnavailable>>;
  /** Everyone who has signed in, with their roles, by email. */
  employees(): Promise<Result<EmployeeView[], ContentStoreUnavailable>>;
}

/** Decides whether a browser credential belongs to an admitted employee. */
export interface EmployeeGate {
  /** The admitted employee, or why the credential does not admit one. */
  requireEmployee(
    credential: Redacted<string> | undefined,
  ): Promise<Result<Employee, Unauthenticated | Forbidden | AuthUnavailable>>;
}

/** Applies employee access policy independently of HTTP and the auth provider SDK. */
export class EditorAccess implements EmployeeGate {
  /**
   * The root supplies the concrete session and role adapters once for the
   * process, and the emails `API_V2_ADMIN_EMAILS` lists.
   */
  constructor(
    private readonly sessions: SessionReader,
    private readonly roles: RoleRecords,
    private readonly adminEmails: readonly string[] = [],
  ) {}

  /**
   * Reject missing, expired, revoked or unavailable sessions before editor
   * operations. Roles are read on every request, so a revocation applies to
   * the next one; a listed admin who lacks the role is granted it here.
   */
  async requireEmployee(
    credential: Redacted<string> | undefined,
  ): Promise<Result<Employee, Unauthenticated | Forbidden | AuthUnavailable>> {
    if (credential === undefined) return err(new Unauthenticated());
    const session = await this.sessions.findSession(credential);
    if (!session.ok) return session;
    const identity = session.value;
    if (identity === null) return err(new Unauthenticated());
    const roles = await this.roles.rolesOf(identity.id);
    if (!roles.ok)
      return err(
        new AuthUnavailable({ lookup: "roles", operation: "rolesOf" }),
      );
    if (
      this.adminEmails.includes(identity.email) &&
      !roles.value.includes("admin")
    ) {
      const granted = await this.roles.grant(identity.id, "admin", null);
      if (!granted.ok)
        return err(
          new AuthUnavailable({ lookup: "roles", operation: "grant" }),
        );
      roles.value.push("admin");
    }
    return ok({
      id: identity.id,
      email: identity.email,
      name: identity.name,
      roles: roles.value,
    });
  }
}
