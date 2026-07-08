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
  isAuthorized,
  userHasRepoWriteAccess,
  userIsTeamMember,
} from "../../server/github-oauth";
import { repoOwner } from "../../server/github-repo";
import {
  normalizeOAuthBase,
  parseOAuthStateCookie,
  serializeOAuthStateCookie,
  SESSION_TTL_SECONDS,
  type SessionPayload,
} from "../../server/session";
import { safeEqual, setSession } from "../../server/session-cipher.server";
import { getGitHubOAuthCreds, getSessionSecret } from "../../server/secrets";

const QuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

// The OAuth callback is only reached via a redirect from GitHub (a full-page
// navigation), so the server-only request/response helpers are safe to call
// from beforeLoad. Wrap them in `createIsomorphicFn` so the
// `@tanstack/react-start/server` import is stripped from the client bundle.
const readCookieHeader = createIsomorphicFn()
  .server((): string | null => getRequestHeaders().get("cookie") ?? null)
  .client((): string | null => null);

const setResponseCookies = createIsomorphicFn()
  .server((cookies: string | string[]) => {
    setResponseHeader("Set-Cookie", cookies);
  })
  .client(() => {});

const verifyStateMatches = createIsomorphicFn()
  .server((stored: string, given: string): boolean => safeEqual(stored, given))
  .client((): boolean => false);

const issueSessionCookie = createIsomorphicFn()
  .server(
    (
      payload: SessionPayload,
      secret: string,
      opts: { secure: boolean },
    ): string => setSession(payload, secret, opts),
  )
  .client((): string => "");

/**
 * OAuth callback. Validates the CSRF state cookie, exchanges the code for a
 * token, checks team membership (or repo write access), and issues the session
 * cookie — all inline so the Set-Cookie header rides the same response as the
 * redirect to `/` (or `/auth/denied`).
 */
export const Route = createFileRoute("/auth/github_/callback")({
  validateSearch: (search) => QuerySchema.parse(search),
  beforeLoad: async ({ search }) => {
    const rawBase = process.env.OAUTH_REDIRECT_BASE;
    if (!rawBase) throw new Error("OAUTH_REDIRECT_BASE is not set");
    const base = normalizeOAuthBase(rawBase);
    // Local dev authorizes any authenticated GitHub user; a deployed build
    // enforces org/team (or repo-write) membership below.
    const isDev = import.meta.env.DEV;

    const [{ clientId, clientSecret }, sessionSecret] = await Promise.all([
      getGitHubOAuthCreds(),
      getSessionSecret(),
    ]);

    // CSRF state check (read-only on the cookie). A mismatch (or a stale/expired
    // state cookie) redirects to the denied page with a recovery CTA.
    const cookie = readCookieHeader();
    const storedState = parseOAuthStateCookie(cookie);
    if (!storedState || !verifyStateMatches(storedState, search.state)) {
      throw redirect({ to: "/auth/denied", search: { reason: "csrf" } });
    }

    const secure = base.startsWith("https://");

    const accessToken = await exchangeCodeForToken({
      clientId,
      clientSecret,
      code: search.code,
      redirectUri: `${base}/auth/github/callback`,
    });
    const login = await fetchGitHubLogin(accessToken);
    let isTeamMember = false;
    let hasRepoWrite = false;
    if (!isDev) {
      const org = repoOwner();
      const teamSlug = process.env.GITHUB_TEAM_SLUG;
      if (!teamSlug) throw new Error("GITHUB_TEAM_SLUG is not set");
      isTeamMember = await userIsTeamMember({
        accessToken,
        org,
        teamSlug,
        login,
      });
      if (!isTeamMember) {
        hasRepoWrite = await userHasRepoWriteAccess({ accessToken, org, login });
      }
    }
    const allowed = isAuthorized({ isDev, isTeamMember, hasRepoWrite });

    if (!allowed) {
      // Clear the CSRF state cookie even on denial, so a retry starts clean.
      setResponseCookies(serializeOAuthStateCookie("", { secure, clear: true }));
      throw redirect({ to: "/auth/denied" });
    }

    const sessionCookie = issueSessionCookie(
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

    throw redirect({ to: "/" });
  },
});
