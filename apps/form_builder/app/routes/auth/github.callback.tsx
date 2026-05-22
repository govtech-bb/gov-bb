import { createFileRoute, redirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import {
  getRequestHeaders,
  setResponseHeader,
} from "@tanstack/react-start/server";
import { z } from "zod";
import {
  exchangeCodeForToken,
  fetchGitHubLogin,
  userHasRepoWriteAccess,
} from "../../server/github-oauth";
import {
  parseOAuthStateCookie,
  safeEqual,
  serializeOAuthStateCookie,
  setSession,
  SESSION_TTL_SECONDS,
} from "../../server/session";

const QuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

// The OAuth callback is only ever reached via a redirect from GitHub (a
// full-page navigation), so the server-only request/response helpers are
// safe to call from beforeLoad. Wrap them in `createIsomorphicFn` so the
// `@tanstack/react-start/server` import is stripped from the client bundle
// (the import-protection plugin rejects it otherwise).
const readCookieHeader = createIsomorphicFn()
  .server((): string | null => getRequestHeaders().get("cookie") ?? null)
  .client((): string | null => null);

const setResponseCookies = createIsomorphicFn()
  .server((cookies: string | string[]) => {
    setResponseHeader("Set-Cookie", cookies);
  })
  .client((_cookies: string | string[]) => {});

/**
 * OAuth callback. Validates the CSRF state cookie, exchanges the code for a
 * token, checks the user's repo permission, and issues the session cookie —
 * all inline so the Set-Cookie header rides the same response as the
 * redirect to `/builder` (or `/auth/denied`).
 *
 * See `auth.ts` for the rationale on why this is NOT a `createServerFn`.
 */
export const Route = createFileRoute("/auth/github/callback")({
  validateSearch: (search) => QuerySchema.parse(search),
  beforeLoad: async ({ search }) => {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    const sessionSecret = process.env.SESSION_SECRET;
    const base = process.env.OAUTH_REDIRECT_BASE;
    if (!clientId) throw new Error("GITHUB_OAUTH_CLIENT_ID is not set");
    if (!clientSecret) throw new Error("GITHUB_OAUTH_CLIENT_SECRET is not set");
    if (!sessionSecret) throw new Error("SESSION_SECRET is not set");
    if (!base) throw new Error("OAUTH_REDIRECT_BASE is not set");

    // CSRF state check (read-only on the cookie).
    const cookie = readCookieHeader();
    const storedState = parseOAuthStateCookie(cookie);
    if (!storedState || !safeEqual(storedState, search.state)) {
      throw new Error("OAuth state mismatch — possible CSRF attempt");
    }

    const secure = base.startsWith("https://");

    const accessToken = await exchangeCodeForToken({
      clientId,
      clientSecret,
      code: search.code,
      redirectUri: `${base}/auth/github/callback`,
    });
    const login = await fetchGitHubLogin(accessToken);
    const allowed = await userHasRepoWriteAccess({ accessToken, login });

    if (!allowed) {
      // Clear the CSRF state cookie even on denial, so a retry starts clean.
      setResponseCookies(serializeOAuthStateCookie("", { secure, clear: true }));
      throw redirect({ to: "/auth/denied" });
    }

    // Issue the session cookie and clear the CSRF cookie, both on this same
    // response so they ride along with the 302 to /builder.
    const sessionCookie = setSession(
      {
        login,
        accessToken,
        expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
      },
      sessionSecret,
      { secure },
    );
    const clearedStateCookie = serializeOAuthStateCookie("", {
      secure,
      clear: true,
    });
    setResponseCookies([sessionCookie, clearedStateCookie]);

    throw redirect({ to: "/builder" });
  },
});
