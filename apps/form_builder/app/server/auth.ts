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
 * This is a read-only operation — it only inspects the request's `Cookie`
 * header and decrypts the session blob. It does NOT mutate response headers,
 * which makes it safe to invoke from a `createServerFn` (RPC) context.
 *
 * Note: the OAuth flows (initiate / callback / logout) used to live here as
 * server functions, but were moved into route `beforeLoad` handlers because
 * `setResponseHeader("Set-Cookie", ...)` inside a server-function handler
 * targets the RPC response, not the route's navigation response. When a
 * route then throws `redirect({ href })`, the Set-Cookie never reaches the
 * browser. Doing the cookie write inline in `beforeLoad` keeps the header
 * attached to the same response that carries the redirect.
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
 * This is a POST `createServerFn` (not the old GET `/auth/logout` route) to
 * close a CSRF/DoS vector: a GET route could be triggered cross-origin by a
 * `<img src=".../auth/logout">` because `SameSite=Lax` sends the cookie on
 * top-level navigation. A TanStack RPC POST uses a non-simple content-type,
 * which a cross-origin `<img>` or simple form cannot reproduce, so the attack
 * no longer fires.
 *
 * Unlike the OAuth flows, this clears the cookie via `setResponseHeader` on the
 * RPC response itself — no redirect is thrown here, so the Set-Cookie rides the
 * same-origin RPC fetch response and the browser honors it. The caller (the
 * denied page) navigates afterward on the client. `secure` is derived from the
 * normalized `OAUTH_REDIRECT_BASE` the same way the other flows do, so the
 * clearing cookie's attributes match the session cookie that was set.
 */
export const logoutSession = createServerFn({ method: "POST" }).handler(
  async (): Promise<void> => {
    const base = normalizeOAuthBase(process.env.OAUTH_REDIRECT_BASE ?? "");
    const secure = base.startsWith("https://");
    setResponseHeader("Set-Cookie", clearSession({ secure }));
  },
);
