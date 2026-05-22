// Pure cookie helpers and session metadata. This module is intentionally
// crypto-free so it stays safe for the client bundle — route files
// (`auth/github.tsx`, `auth/logout.tsx`, `auth/github_.callback.tsx`) pull
// in helpers from here, and they get bundled into client code even though
// their `beforeLoad` only runs server-side. Crypto-using counterparts
// (encrypt/decrypt, getSession, setSession, safeEqual) live in
// `./session-cipher.server.ts`, which the import-protection plugin keeps
// out of client bundles.

export const SESSION_COOKIE_NAME = "fb_session";
export const OAUTH_STATE_COOKIE_NAME = "fb_oauth_state";

/** 8 hours in seconds. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
/** 10 minutes in seconds — covers the longest plausible OAuth round-trip. */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export interface SessionPayload {
  /** GitHub login (username). */
  login: string;
  /** GitHub access token (opaque string). Never written to logs. */
  accessToken: string;
  /** Epoch milliseconds when the session expires. */
  expiresAt: number;
}

/** Build a `Set-Cookie` header value for the session cookie. */
export function serializeSessionCookie(
  value: string,
  opts: { secure: boolean; clear?: boolean; maxAgeSeconds?: number } = {
    secure: true,
  },
): string {
  const maxAge = opts.clear ? 0 : (opts.maxAgeSeconds ?? SESSION_TTL_SECONDS);
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Build a `Set-Cookie` header value for the OAuth CSRF state cookie. */
export function serializeOAuthStateCookie(
  value: string,
  opts: { secure: boolean; clear?: boolean } = { secure: true },
): string {
  const maxAge = opts.clear ? 0 : OAUTH_STATE_TTL_SECONDS;
  const parts = [
    `${OAUTH_STATE_COOKIE_NAME}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Extract the value of `fb_session` from a `Cookie` header. Returns null if absent. */
export function parseSessionCookie(header: string | null): string | null {
  return parseNamedCookie(header, SESSION_COOKIE_NAME);
}

/** Extract the value of `fb_oauth_state` from a `Cookie` header. Returns null if absent. */
export function parseOAuthStateCookie(header: string | null): string | null {
  return parseNamedCookie(header, OAUTH_STATE_COOKIE_NAME);
}

function parseNamedCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(";");
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/** Build the `Set-Cookie` header value that clears the session. */
export function clearSession(
  opts: { secure: boolean } = { secure: true },
): string {
  return serializeSessionCookie("", { secure: opts.secure, clear: true });
}
