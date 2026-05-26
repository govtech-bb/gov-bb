import { createFileRoute, redirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { serializeOAuthStateCookie } from "../../server/session";

// `randomBytes` comes from `node:crypto`, which Vite externalizes in the
// client bundle (any property access on the stub throws). Wrapping the call
// in `createIsomorphicFn` lets the import-protection plugin strip the
// top-level import — same pattern as `setResponseHeader` below.
const generateStateHex = createIsomorphicFn()
  .server((bytes: number): string => randomBytes(bytes).toString("hex"))
  .client((_bytes: number): string => "");

/**
 * Step 1 of the OAuth dance: generate a CSRF `state`, set the short-lived
 * `fb_oauth_state` cookie on THIS response, and redirect to GitHub's authorize
 * endpoint.
 *
 * Why is this not in a `createServerFn`? Because `setResponseHeader` inside
 * a server function writes to the RPC handler's response, not the route's
 * navigation response. When we then `throw redirect({ href })` from
 * beforeLoad, the redirect carries the route's response headers — so the
 * cookie set inside the RPC handler would be lost. Doing it inline keeps
 * the Set-Cookie attached to the same 302 that sends the browser to GitHub.
 *
 * The setResponseHeader call is wrapped in `createIsomorphicFn` so the
 * server-only import is stripped from the client bundle (import-protection
 * plugin rejects it otherwise). Reaching /auth/github via client navigation
 * would no-op the cookie write — callers should use a full-page navigation.
 */
const setOAuthStateCookie = createIsomorphicFn()
  .server((cookie: string) => {
    setResponseHeader("Set-Cookie", cookie);
  })
  .client((_cookie: string) => {});

export const Route = createFileRoute("/auth/github")({
  beforeLoad: () => {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const base = process.env.OAUTH_REDIRECT_BASE;
    if (!clientId) throw new Error("GITHUB_OAUTH_CLIENT_ID is not set");
    if (!base) throw new Error("OAUTH_REDIRECT_BASE is not set");

    const state = generateStateHex(16);
    const secure = base.startsWith("https://");
    setOAuthStateCookie(serializeOAuthStateCookie(state, { secure }));

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${base}/auth/github/callback`,
      scope: "repo read:user",
      state,
      allow_signup: "false",
    });

    throw redirect({
      href: `https://github.com/login/oauth/authorize?${params.toString()}`,
    });
  },
});
