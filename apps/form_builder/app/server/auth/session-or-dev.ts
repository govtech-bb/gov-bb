import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getSession } from "../session-cipher.server";
import { getSessionSecret } from "../secrets";

/**
 * Like {@link requireSession}, but tolerant in local dev: if there is no valid
 * session — or no `SESSION_SECRET` configured at all — it passes `token: null`
 * instead of throwing, so the content CMS can fall back to reading the local
 * landing checkout (no GitHub OAuth needed to browse/edit locally). In
 * production a missing session still throws.
 *
 * Lives beside `require-session.ts` so its server-only session imports
 * (`session-cipher.server.ts`) are stripped from the client bundle the same
 * way — importing them into a client-bundled module trips rolldown's
 * `.server.ts` guard.
 */
export const sessionTokenOrDev = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    let token: string | null = null;
    try {
      const headers = getRequestHeaders();
      const cookie =
        (headers as { get?: (k: string) => string | null }).get?.("cookie") ??
        (headers as { cookie?: string }).cookie ??
        null;
      const secret = await getSessionSecret();
      token = getSession(cookie, secret)?.accessToken ?? null;
    } catch {
      token = null;
    }
    if (token === null && !import.meta.env.DEV) {
      throw new Error("Not authenticated");
    }
    return next({ context: { token } });
  },
);
