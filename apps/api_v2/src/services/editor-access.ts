import {
  Unauthenticated,
  type Employee,
  type Forbidden,
  type AuthUnavailable,
} from "../modules/auth";
import type { Redacted } from "../modules/redacted";
import { err, type Result } from "../modules/result";

/** The only session capability required to authorize editor access. */
export interface SessionReader {
  /** Verify the opaque browser credential and return its admitted employee. */
  findSession(
    credential: Redacted<string>,
  ): Promise<Result<Employee | null, Forbidden | AuthUnavailable>>;
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
  /** The root supplies the concrete session adapter once for the process. */
  constructor(private readonly sessions: SessionReader) {}

  /** Reject missing, expired, revoked or unavailable sessions before editor operations. */
  async requireEmployee(
    credential: Redacted<string> | undefined,
  ): Promise<Result<Employee, Unauthenticated | Forbidden | AuthUnavailable>> {
    if (credential === undefined) return err(new Unauthenticated());
    const session = await this.sessions.findSession(credential);
    if (!session.ok) return session;
    return session.value === null
      ? err(new Unauthenticated())
      : { ok: true, value: session.value };
  }
}
