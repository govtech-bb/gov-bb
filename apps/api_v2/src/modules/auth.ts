import { z } from "zod";
import { err, ok, type Result } from "./result";

/** Only active members of this GitHub organization can provision editor sessions. */
export const GITHUB_ORGANIZATION = "govtech-bb";

/** What an employee may do, as `user_roles` stores it. */
export const ROLES = ["editor", "approver", "admin"] as const;

/** Parses a role. */
export const Role = z.enum(ROLES);

/** A role: `editor` writes content, `approver` changes what citizens see, `admin` grants and revokes roles. */
export type Role = z.infer<typeof Role>;

/**
 * An `auth_user` id: what the history records as a change's actor. Not
 * always a UUID (`system`, `local-developer`), but never empty, which the
 * history would silently read as `system`.
 */
export const UserId = z.string().min(1).brand<"UserId">();

/** An `auth_user` id. */
export type UserId = z.infer<typeof UserId>;

/** A verified session's user, before their roles are read. */
export interface Identity {
  readonly id: UserId;
  readonly email: string;
  readonly name: string;
}

/** An admitted employee and their roles, without session or provider tokens. */
export interface Employee extends Identity {
  readonly roles: readonly Role[];
}

/** An employee as the editor and the role routes read them. */
export const EmployeeView = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  roles: z.array(Role),
});

/** An employee as the editor and the role routes read them. */
export type EmployeeView = z.infer<typeof EmployeeView>;

/** No live employee session accompanied the request. */
export class Unauthenticated extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "Unauthenticated";
  /** Explain how a caller can recover without exposing credentials. */
  constructor() {
    super("Sign in with your GitHub account.");
  }
}

/** A verified identity does not satisfy the editor's admission policy. */
export class Forbidden extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "Forbidden";
  /** Describe the required organization without exposing rejected profile data. */
  constructor() {
    super(
      "Use a GitHub account with a verified email and active govtech-bb membership.",
    );
  }
}

/** A change to what citizens see, by an employee without the approver role. */
export class NotApprover extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "NotApprover";
  /** Say who can make the change. */
  constructor() {
    super("Only approvers can change who can see a page.");
  }
}

/**
 * An approver deciding on a revision they changed or submitted, or making
 * public content they changed since the page was last public (ADR 0079).
 */
export class SelfApproval extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "SelfApproval";
  /** Say who can decide instead. */
  constructor(
    message = "You can't approve or reject a change you made or submitted. Ask another approver.",
  ) {
    super(message);
  }
}

/** A role grant named a user who has never signed in. */
export class UserNotFound extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "UserNotFound";
  /** The id that matched nobody. */
  constructor(readonly id: string) {
    super(`No user with id ${id}. They must sign in once first.`);
  }
}

/** Session verification could not be completed; access must remain closed. */
export class AuthUnavailable extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "AuthUnavailable";
  /**
   * Do not retain SDK errors containing tokens or SQL parameters. `failure`
   * says which lookup failed, for the log: the session, or the employee's
   * roles, naming the role-store operation.
   */
  constructor(
    readonly failure:
      | { readonly lookup: "session" }
      | {
          readonly lookup: "roles";
          readonly operation: "rolesOf" | "grant";
        } = {
      lookup: "session",
    },
  ) {
    super("Sign-in is temporarily unavailable. Try again.");
  }
}

const employeeEmail = z.email().transform((email) => email.toLowerCase());
const employeeSchema = z.object({
  id: UserId,
  email: employeeEmail,
  name: z.string(),
  emailVerified: z.literal(true),
});

/** Reapply local employee policy to the user in a verified database session. */
export function parseEmployee(input: unknown): Result<Identity, Forbidden> {
  const parsed = employeeSchema.safeParse(input);
  return parsed.success
    ? ok({
        id: parsed.data.id,
        email: parsed.data.email,
        name: parsed.data.name,
      })
    : err(new Forbidden());
}

const githubIdentity = z.object({
  email: employeeEmail,
  emailVerified: z.literal(true),
  source: z.object({
    method: z.literal("oauth"),
    oauth: z.object({
      providerId: z.literal("github"),
      profile: z.object({
        email: employeeEmail,
        organizationMembership: z.object({
          state: z.literal("active"),
          organization: z.object({ login: z.literal(GITHUB_ORGANIZATION) }),
        }),
      }),
    }),
  }),
});

/** Admit fresh GitHub claims on both provisioning and returning OAuth sign-ins. */
export function admitGitHubIdentity(input: unknown): Result<void, Forbidden> {
  const parsed = githubIdentity.safeParse(input);
  if (
    !parsed.success ||
    parsed.data.email !== parsed.data.source.oauth.profile.email
  )
    return err(new Forbidden());
  return ok(undefined);
}
