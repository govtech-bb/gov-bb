import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getSession } from "../session-cipher.server";
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
    const headers = getRequestHeaders();
    const cookie =
      (headers as { get?: (k: string) => string | null }).get?.("cookie") ??
      (headers as { cookie?: string }).cookie ??
      null;
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error("SESSION_SECRET is not set");
    const session: SessionPayload | null = getSession(cookie, secret);
    if (!session) throw new Error("Not authenticated");
    return next({ context: { session } });
  },
);
