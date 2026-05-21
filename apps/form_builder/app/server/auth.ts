import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getBuilderSession } from "./session.server";
import { isSessionValid } from "./session-types";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchUserInfo,
} from "./github-oauth.server";
import * as crypto from "node:crypto";

export type AuthContext =
  | { authed: false }
  | {
      authed: true;
      githubLogin: string;
      teamMemberships: string[];
      isPublisher: boolean;
    };

/**
 * Non-throwing session probe for route guards and UI. Server functions that
 * perform actual work use requireSession/requirePublisher from
 * auth-middleware.server to enforce auth — this one returns a discriminated
 * union so callers can cleanly branch between "redirect to login" and "render
 * the app".
 */
export const getAuthContext = createServerFn({
  method: "GET",
  strict: false,
}).handler(async (): Promise<AuthContext> => {
  const session = await getBuilderSession();
  if (!isSessionValid(session.data)) return { authed: false };

  const teamSlug = process.env.GITHUB_PUBLISH_TEAM_SLUG;
  const teamMemberships = session.data.teamMemberships ?? [];
  return {
    authed: true,
    githubLogin: session.data.githubLogin as string,
    teamMemberships,
    isPublisher: !!teamSlug && teamMemberships.includes(teamSlug),
  };
});

/**
 * Start the OAuth flow: generate a CSRF state, store it in the session, and
 * return the GitHub authorize URL. Called from /auth/login's beforeLoad which
 * then throws a redirect to the returned URL.
 */
export const beginLogin = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ authorizeUrl: string }> => {
    const state = crypto.randomBytes(16).toString("hex");
    const session = await getBuilderSession();
    await session.update({ oauthState: state });
    return { authorizeUrl: buildAuthorizeUrl(state) };
  },
);

const completeLoginSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

/**
 * Finish the OAuth flow: verify state, exchange code for token, fetch the
 * user's identity and team memberships, persist to session. Called from
 * /auth/callback's beforeLoad.
 */
export const completeLogin = createServerFn({ method: "GET" })
  .inputValidator(completeLoginSchema)
  .handler(
    async ({ data }): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const session = await getBuilderSession();
      const expectedState = session.data.oauthState;
      if (!expectedState || expectedState !== data.state) {
        await session.clear();
        return { ok: false, reason: "state-mismatch" };
      }

      const { accessToken, expiresAt } = await exchangeCodeForToken(data.code);
      const { login, teamMemberships } = await fetchUserInfo(accessToken);

      await session.update({
        githubLogin: login,
        accessToken,
        teamMemberships,
        expiresAt,
        oauthState: undefined,
      });

      return { ok: true };
    },
  );

/**
 * Clear the session cookie. Called from /auth/logout's beforeLoad.
 */
export const signOut = createServerFn({ method: "GET" }).handler(
  async (): Promise<void> => {
    const session = await getBuilderSession();
    await session.clear();
  },
);
