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
 * throws if there's no valid session. The decoded payload is passed down via
 * context so handlers can read `context.session.login` (used as the audit
 * author on PUT /service_status) without re-doing the work.
 */
export const requireSession = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    let session: SessionPayload | null = null;
    try {
      const headers = getRequestHeaders();
      const cookie =
        (headers as { get?: (k: string) => string | null }).get?.("cookie") ??
        (headers as { cookie?: string }).cookie ??
        null;
      const secret = await getSessionSecret();
      session = getSession(cookie, secret);
    } catch (err) {
      // Local dev tolerance: no SESSION_SECRET configured falls through to the
      // dev session below. In production the error propagates (DEV is
      // statically false there).
      if (!import.meta.env.DEV) throw err;
    }
    if (!session) {
      if (!import.meta.env.DEV) throw new Error("Not authenticated");
      session = {
        login: "dev",
        accessToken: "",
        expiresAt: Date.now() + 60 * 60 * 1000,
      };
    }
    return next({ context: { session } });
  },
);
