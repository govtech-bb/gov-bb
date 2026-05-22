import { createServerFn } from "@tanstack/react-start";
import {
  getRequestHeaders,
  setResponseHeader,
} from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import {
  getSession,
  parseOAuthStateCookie,
  safeEqual,
  serializeOAuthStateCookie,
  setSession,
  clearSession,
  SESSION_TTL_SECONDS,
} from "./session";

/**
 * Check the current session from the request cookie.
 * Returns { login } if authenticated, null otherwise.
 */
export const checkSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ login: string } | null> => {
    const headers = getRequestHeaders();
    const cookie = headers.get("cookie") ?? null;
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      throw new Error("SESSION_SECRET is not set");
    }
    const session = getSession(cookie, secret);
    if (!session) return null;
    return { login: session.login };
  },
);

/**
 * Initiate GitHub OAuth: set CSRF state cookie and return the redirect URL.
 */
export const initiateGitHubOAuth = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ redirectUrl: string }> => {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const base = process.env.OAUTH_REDIRECT_BASE;
    if (!clientId) throw new Error("GITHUB_OAUTH_CLIENT_ID is not set");
    if (!base) throw new Error("OAUTH_REDIRECT_BASE is not set");

    const state = randomBytes(16).toString("hex");
    const secure = base.startsWith("https://");
    setResponseHeader(
      "Set-Cookie",
      serializeOAuthStateCookie(state, { secure }),
    );

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${base}/auth/github/callback`,
      scope: "repo read:user",
      state,
      allow_signup: "false",
    });

    return {
      redirectUrl: `https://github.com/login/oauth/authorize?${params.toString()}`,
    };
  },
);

/**
 * Handle the OAuth callback: validate state, exchange code, check permissions,
 * set session cookie. Returns { denied: true } if access is not allowed.
 */
export const handleGitHubCallback = createServerFn({ method: "GET" }).handler(
  async ({
    data,
  }: {
    data: { code: string; state: string };
  }): Promise<{ denied?: boolean }> => {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    const sessionSecret = process.env.SESSION_SECRET;
    const base = process.env.OAUTH_REDIRECT_BASE;
    if (!clientId) throw new Error("GITHUB_OAUTH_CLIENT_ID is not set");
    if (!clientSecret) throw new Error("GITHUB_OAUTH_CLIENT_SECRET is not set");
    if (!sessionSecret) throw new Error("SESSION_SECRET is not set");
    if (!base) throw new Error("OAUTH_REDIRECT_BASE is not set");

    // CSRF state check
    const headers = getRequestHeaders();
    const cookie = headers.get("cookie") ?? null;
    const storedState = parseOAuthStateCookie(cookie);
    if (!storedState || !safeEqual(storedState, data.state)) {
      throw new Error("OAuth state mismatch — possible CSRF attempt");
    }

    // Exchange code for access token
    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "User-Agent": "gov-bb-form-builder",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: data.code,
          redirect_uri: `${base}/auth/github/callback`,
        }),
      },
    );
    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.status}`);
    }
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenJson.access_token) {
      throw new Error(
        `Token exchange returned no access_token: ${tokenJson.error_description ?? tokenJson.error ?? "unknown"}`,
      );
    }
    const accessToken = tokenJson.access_token;

    // Fetch the authenticated user
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "gov-bb-form-builder",
      },
    });
    if (!userRes.ok) {
      throw new Error(`GET /user failed: ${userRes.status}`);
    }
    const user = (await userRes.json()) as { login?: string };
    if (!user.login) {
      throw new Error("GET /user returned no login");
    }

    // Permission check
    const permRes = await fetch(
      `https://api.github.com/repos/govtech-bb/gov-bb/collaborators/${encodeURIComponent(user.login)}/permission`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "gov-bb-form-builder",
        },
      },
    );
    if (permRes.status === 404 || permRes.status === 403) {
      return { denied: true };
    }
    if (!permRes.ok) {
      throw new Error(`Permission check failed: ${permRes.status}`);
    }
    const perm = (await permRes.json()) as { permission?: string };
    if (perm.permission !== "write" && perm.permission !== "admin") {
      return { denied: true };
    }

    // Issue session cookie, clear CSRF state cookie
    const secure = base.startsWith("https://");
    const sessionCookie = setSession(
      {
        login: user.login,
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
    setResponseHeader("Set-Cookie", [sessionCookie, clearedStateCookie]);

    return {};
  },
);

/**
 * Clear the session cookie for logout.
 */
export const logoutSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<void> => {
    const base = process.env.OAUTH_REDIRECT_BASE ?? "";
    const secure = base.startsWith("https://");
    setResponseHeader("Set-Cookie", clearSession({ secure }));
  },
);
