import { createFileRoute, redirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import {
  normalizeOAuthBase,
  serializeOAuthStateCookie,
} from "../../server/session";
import { getGitHubOAuthCreds } from "../../server/secrets";

// `randomBytes` comes from `node:crypto`, which Vite externalizes in the client
// bundle (any property access on the stub throws). Wrapping the call in
// `createIsomorphicFn` lets the import-protection plugin strip the top-level
// import — same pattern as `setResponseHeader` below.
const generateStateHex = createIsomorphicFn()
  .server((bytes: number): string => randomBytes(bytes).toString("hex"))
  .client((): string => "");

// `setResponseHeader` inside a server function writes to the RPC handler's
// response, not the route's navigation response. When we `throw redirect` from
// beforeLoad the redirect carries the route's response headers, so the cookie
// set inside an RPC handler would be lost — do it inline instead.
const setOAuthStateCookie = createIsomorphicFn()
  .server((cookie: string) => {
    setResponseHeader("Set-Cookie", cookie);
  })
  .client(() => {});

/**
 * Step 1 of the OAuth dance: generate a CSRF `state`, set the short-lived
 * `ff_oauth_state` cookie on THIS response, and redirect to GitHub's authorize
 * endpoint.
 */
export const Route = createFileRoute("/auth/github")({
  beforeLoad: async () => {
    const { clientId } = await getGitHubOAuthCreds();
    const rawBase = process.env.OAUTH_REDIRECT_BASE;
    if (!rawBase) throw new Error("OAUTH_REDIRECT_BASE is not set");
    const base = normalizeOAuthBase(rawBase);

    const state = generateStateHex(16);
    const secure = base.startsWith("https://");
    setOAuthStateCookie(serializeOAuthStateCookie(state, { secure }));

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${base}/auth/github/callback`,
      // `read:org` is required by the team-membership check; `public_repo`
      // covers the collaborator-permission fallback read on the public gov-bb
      // repo. CAVEAT: if gov-bb is ever made private, bump to `repo`.
      scope: "public_repo read:org",
      state,
      allow_signup: "false",
    });

    throw redirect({
      href: `https://github.com/login/oauth/authorize?${params.toString()}`,
    });
  },
});
