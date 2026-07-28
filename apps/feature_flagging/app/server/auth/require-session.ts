import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getSession } from "../session-cipher.server";
import { getSessionSecret } from "../secrets";
import type { SessionPayload } from "../session";

/**
 * Server-function middleware that requires a valid session cookie.
 *
 * Use this on any `createServerFn` invoked from the browser UI — the
 * route-level beforeLoad gates initial navigation, but TanStack server
 * functions are direct HTTP endpoints that the browser (or anything else with a
 * valid cookie) can hit independently.
 *
 * Reads the `Cookie` header, decrypts the session blob with SESSION_SECRET, and
 * throws if there's no valid session. A valid GitHub login is required in every
 * environment — there is no dev bypass. (Local dev still signs in via GitHub; it
 * only skips the org/team authorization check — see auth/github_.callback.tsx.)
 * The decoded payload is passed down via context so handlers can read
 * `context.session.login` (the audit author on PUT /service_status).
 */
export const requireSession = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const headers = getRequestHeaders();
    const cookie =
      (headers as { get?: (k: string) => string | null }).get?.("cookie") ??
      (headers as { cookie?: string }).cookie ??
      null;
    const secret = await getSessionSecret();
    const session: SessionPayload | null = getSession(cookie, secret);
    if (!session) throw new Error("Not authenticated");
    return next({ context: { session } });
  },
);
