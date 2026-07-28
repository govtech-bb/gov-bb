import { createServerFn } from "@tanstack/react-start";
import {
  getRequestHeaders,
  setResponseHeader,
} from "@tanstack/react-start/server";
import { clearSession, normalizeOAuthBase } from "./session";
import { getSession } from "./session-cipher.server";
import { getSessionSecret } from "./secrets";

/**
 * Check the current session from the request cookie.
 * Returns { login } if authenticated, null otherwise.
 *
 * Read-only — it only inspects the request's `Cookie` header and decrypts the
 * session blob. It does NOT mutate response headers, which makes it safe to
 * invoke from a `createServerFn` (RPC) context.
 */
export const checkSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ login: string } | null> => {
    const headers = getRequestHeaders();
    const cookie = headers.get("cookie") ?? null;
    const secret = await getSessionSecret();
    const session = getSession(cookie, secret);
    if (!session) return null;
    return { login: session.login };
  },
);

/**
 * Log the user out by clearing the session cookie.
 *
 * A POST `createServerFn` (not a GET route) to close a CSRF/DoS vector: a GET
 * route could be triggered cross-origin by `<img src=".../auth/logout">`
 * because `SameSite=Lax` sends the cookie on top-level navigation. A TanStack
 * RPC POST uses a non-simple content-type a cross-origin `<img>` or simple form
 * cannot reproduce, so the attack no longer fires.
 */
export const logoutSession = createServerFn({ method: "POST" }).handler(
  async (): Promise<void> => {
    const base = normalizeOAuthBase(process.env.OAUTH_REDIRECT_BASE ?? "");
    const secure = base.startsWith("https://");
    setResponseHeader("Set-Cookie", clearSession({ secure }));
  },
);
