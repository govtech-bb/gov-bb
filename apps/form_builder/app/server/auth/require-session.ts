import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getSession } from "../session-cipher.server";
import { getSessionSecret } from "../secrets";
import type { SessionPayload } from "../session";

/**
 * Server-function middleware that requires a valid session cookie.
 *
 * Use this on any `createServerFn` invoked from the browser UI — the
 * route-level beforeLoad at `/builder` gates initial navigation but
 * Tanstack server functions are direct HTTP endpoints that the browser
 * (or anything else with a valid cookie) can hit independently.
 *
 * Reads the `Cookie` header from the inbound request, decrypts the
 * session blob with SESSION_SECRET, and throws if there's no valid
 * session. The decoded payload is passed down via context so handlers
 * can read `context.session.accessToken` without re-doing the work.
 *
 * For service-to-service auth (Amplify SSR → ECS form_builder_api) we
 * keep the shared ADMIN_API_TOKEN pattern — see api-client.ts. The two
 * boundaries are distinct: cookies for browser, secrets for services.
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
      // Local dev tolerance, mirroring sessionTokenOrDev: no SESSION_SECRET
      // configured falls through to the dev session below. In production the
      // error still propagates (DEV is statically false there).
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
