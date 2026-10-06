/** Expected failures at the editor's authentication boundary. */
export class AuthFailure extends Error {
  /** Stable error discriminator. */
  readonly _tag = "AuthFailure";

  /** Safe failure category; provider responses are never displayed verbatim. */
  constructor(readonly reason: "configuration" | "unavailable" | "session" | "provider") {
    super(
      reason === "configuration"
        ? "Set VITE_API_ORIGIN to a valid API origin (HTTPS in production)."
        : "Authentication could not be completed.",
    );
    this.name = "AuthFailure";
  }
}

/** Authentication results preserve unavailable versus signed-out states. */
export type AuthResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AuthFailure };

/** The identity and absolute expiry needed by the editor shell. */
export type EmployeeSession = { readonly email: string; readonly expiresAt: number };

/** Parse only the session fields used by the UI; malformed responses are not signed-out responses. */
export function parseEmployeeSession(
  value: unknown,
  now: number,
): AuthResult<EmployeeSession | null> {
  if (value === null) return { ok: true, value: null };

  if (typeof value !== "object" || !value || !("session" in value) || !("user" in value))
    return { ok: false, error: new AuthFailure("unavailable") };
  const { session, user } = value;

  if (
    typeof session !== "object" ||
    !session ||
    !("expiresAt" in session) ||
    typeof user !== "object" ||
    !user ||
    !("email" in user) ||
    typeof user.email !== "string" ||
    !(typeof session.expiresAt === "string" || session.expiresAt instanceof Date)
  )
    return { ok: false, error: new AuthFailure("unavailable") };
  const expiresAt = new Date(session.expiresAt).getTime();

  if (!Number.isFinite(expiresAt)) return { ok: false, error: new AuthFailure("unavailable") };

  return { ok: true, value: expiresAt <= now ? null : { email: user.email, expiresAt } };
}

/** Authentication operations required by the static editor's route boundary. */
export interface EditorAuth {
  /** Recheck the authoritative API session rather than using a UI cache. */
  session(): Promise<AuthResult<EmployeeSession | null>>;
  /** Start GitHub OAuth and return its authorization URL without navigating. */
  signIn(editorOrigin: string, returnTo: string): Promise<AuthResult<string>>;
  /** Revoke the API session without removing browser drafts. */
  signOut(): Promise<AuthResult<void>>;
}

/** Parse the public API origin once at browser/router composition. */
export function parseApiOrigin(value: string | undefined, production: boolean): AuthResult<string> {
  const candidate = value ?? (production ? "" : "http://localhost:3020");

  try {
    const url = new URL(candidate);

    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (production ? url.protocol !== "https:" : !["http:", "https:"].includes(url.protocol))
    ) {
      return { ok: false, error: new AuthFailure("configuration") };
    }

    return { ok: true, value: url.origin };
  } catch {
    return { ok: false, error: new AuthFailure("configuration") };
  }
}

/** Allow only editor workspace destinations, excluding auth loops and external redirects. */
export function localReturnPath(value: string): string {
  // oxlint-disable-next-line no-control-regex -- Reject control characters before URL normalization can erase them.
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value))
    return "/services";
  const url = new URL(value, "https://editor.invalid");

  if (
    url.origin !== "https://editor.invalid" ||
    !(url.pathname === "/" || url.pathname === "/services" || url.pathname.startsWith("/services/"))
  )
    return "/services";

  return `${url.pathname}${url.search}${url.hash}`;
}

/** States of the unguarded authentication route. */
export type AuthSearch = {
  readonly state: "sign-in" | "complete" | "error" | "signed-out";
  readonly returnTo: string;
  readonly reason: "unavailable" | "provider";
};

/** Parse untrusted router search parameters without retaining provider error strings. */
export function parseAuthSearch(search: Record<string, unknown>): AuthSearch {
  const state = search.state;

  return {
    state: state === "sign-in" || state === "complete" || state === "signed-out" ? state : "error",
    returnTo: localReturnPath(typeof search.returnTo === "string" ? search.returnTo : "/services"),
    reason: search.reason === "unavailable" ? "unavailable" : "provider",
  };
}

/** Build an absolute callback restricted to the editor origin and safe workspace path. */
export function authCallback(
  editorOrigin: string,
  state: "complete" | "error",
  returnTo: string,
): string {
  const url = new URL("/auth", editorOrigin);
  url.searchParams.set("state", state);
  url.searchParams.set("returnTo", localReturnPath(returnTo));

  return url.href;
}
