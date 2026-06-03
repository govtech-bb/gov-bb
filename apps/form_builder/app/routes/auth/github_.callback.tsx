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
  userIsTeamMember,
} from "../../server/github-oauth";
import {
  normalizeOAuthBase,
  parseOAuthStateCookie,
  serializeOAuthStateCookie,
  SESSION_TTL_SECONDS,
  type SessionPayload,
} from "../../server/session";
import { safeEqual, setSession } from "../../server/session-cipher.server";
import {
  getGitHubOAuthCreds,
  getSessionSecret,
} from "../../server/secrets";

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

// safeEqual and setSession come from `session-cipher.server.ts` (server-only).
// Same import-protection rationale as `getRequestHeaders` / `setResponseHeader`
// above: wrap usage in `createIsomorphicFn` so the imports are stripped from
// the client bundle even though they sit at the top of this route file.
const verifyStateMatches = createIsomorphicFn()
  .server((stored: string, given: string): boolean => safeEqual(stored, given))
  .client((_stored: string, _given: string): boolean => false);

const issueSessionCookie = createIsomorphicFn()
  .server(
    (
      payload: SessionPayload,
      secret: string,
      opts: { secure: boolean },
    ): string => setSession(payload, secret, opts),
  )
  .client(
    (
      _payload: SessionPayload,
      _secret: string,
      _opts: { secure: boolean },
    ): string => "",
  );

/**
 * OAuth callback. Validates the CSRF state cookie, exchanges the code for a
 * token, checks the user's repo permission, and issues the session cookie —
 * all inline so the Set-Cookie header rides the same response as the
 * redirect to `/builder` (or `/auth/denied`).
 *
 * See `auth.ts` for the rationale on why this is NOT a `createServerFn`.
 */
export const Route = createFileRoute("/auth/github_/callback")({
  validateSearch: (search) => QuerySchema.parse(search),
  beforeLoad: async ({ search }) => {
    const rawBase = process.env.OAUTH_REDIRECT_BASE;
    const org = process.env.GITHUB_ORG;
    const teamSlug = process.env.GITHUB_TEAM_SLUG;
    if (!rawBase) throw new Error("OAUTH_REDIRECT_BASE is not set");
    if (!org) throw new Error("GITHUB_ORG is not set");
    if (!teamSlug) throw new Error("GITHUB_TEAM_SLUG is not set");
    // Strip a trailing slash so the redirect_uri matches the one we sent to
    // GitHub on the authorize request (see auth/github.tsx).
    const base = normalizeOAuthBase(rawBase);

    // Fetch secrets from Secrets Manager (cached per warm Lambda; falls back
    // to process.env.* for local dev). See ../../server/secrets.ts.
    const [{ clientId, clientSecret }, sessionSecret] = await Promise.all([
      getGitHubOAuthCreds(),
      getSessionSecret(),
    ]);

    // CSRF state check (read-only on the cookie). A genuine mismatch (or a
    // stale/expired state cookie) redirects to the denied page with a
    // recovery CTA instead of throwing a raw 500.
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
    const allowed =
      (await userIsTeamMember({ accessToken, org, teamSlug, login })) ||
      (await userHasRepoWriteAccess({ accessToken, org, login }));

    if (!allowed) {
      // Clear the CSRF state cookie even on denial, so a retry starts clean.
      setResponseCookies(serializeOAuthStateCookie("", { secure, clear: true }));
      throw redirect({ to: "/auth/denied" });
    }

    // Issue the session cookie and clear the CSRF cookie, both on this same
    // response so they ride along with the 302 to /builder.
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

    throw redirect({ to: "/builder" });
  },
});
