import { z } from "zod";
import { err, ok, type Result } from "./result";

/** Only this Google Workspace domain can provision editor sessions. */
export const WORKSPACE_DOMAIN = "govtech.bb";

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
    super("Sign in with your govtech.bb Google account.");
  }
}

/** A verified identity does not satisfy the editor's admission policy. */
export class Forbidden extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "Forbidden";
  /** Describe the required organization without exposing rejected profile data. */
  constructor() {
    super("Use a verified govtech.bb Google Workspace account.");
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

const employeeEmail = z
  .email()
  .transform((email) => email.toLowerCase())
  .refine((email) => email.split("@")[1] === WORKSPACE_DOMAIN);
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

const googleIdentity = z.object({
  email: employeeEmail,
  source: z.object({
    method: z.literal("oauth"),
    oauth: z.object({
      providerId: z.literal("google"),
      profile: z.object({
        email: employeeEmail,
        email_verified: z.literal(true),
        hd: z.literal(WORKSPACE_DOMAIN),
      }),
    }),
  }),
});

/** Admit fresh Google claims on both provisioning and returning OAuth sign-ins. */
export function admitGoogleIdentity(input: unknown): Result<void, Forbidden> {
  const parsed = googleIdentity.safeParse(input);
  if (
    !parsed.success ||
    parsed.data.email !== parsed.data.source.oauth.profile.email
  )
    return err(new Forbidden());
  return ok(undefined);
}
