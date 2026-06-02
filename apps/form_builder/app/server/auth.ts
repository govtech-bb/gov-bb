import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
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
