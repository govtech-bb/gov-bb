import { z } from "zod";
import { err, ok, type Result } from "./result";

/** Only active members of this GitHub organization can provision editor sessions. */
export const GITHUB_ORGANIZATION = "govtech-bb";

/** An admitted employee, without session or provider tokens. */
export interface Employee {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

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

/** Session verification could not be completed; access must remain closed. */
export class AuthUnavailable extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "AuthUnavailable";
  /** Safe operation metadata for request-correlated diagnostics. */
  readonly operation = "read_session";
  /** Do not retain SDK errors containing tokens or SQL parameters. */
  constructor() {
    super("Sign-in is temporarily unavailable. Try again.");
  }
}

const employeeEmail = z.email().transform((email) => email.toLowerCase());
const employeeSchema = z.object({
  id: z.string().min(1),
  email: employeeEmail,
  name: z.string(),
  emailVerified: z.literal(true),
});

/** Reapply local employee policy to the user in a verified database session. */
export function parseEmployee(input: unknown): Result<Employee, Forbidden> {
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
