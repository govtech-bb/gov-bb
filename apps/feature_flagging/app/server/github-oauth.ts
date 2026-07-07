/**
 * Pure helpers for the GitHub OAuth handshake.
 *
 * These functions don't touch cookies or response headers — they only do
 * network I/O and return data. Cookie I/O is the caller's responsibility
 * (typically a route's `beforeLoad`), because cookies must be set on the
 * route's navigation response, not on a server-function's RPC response.
 */

import { REPO_NAME } from "./github-repo";

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const USER_AGENT = "gov-bb-feature-flagging";

/**
 * Exchange an OAuth `code` for an access token.
 * Throws on transport failures or if GitHub does not return a token.
 */
export async function exchangeCodeForToken(args: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<string> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      client_id: args.clientId,
      client_secret: args.clientSecret,
      code: args.code,
      redirect_uri: args.redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!json.access_token) {
    throw new Error(
      `Token exchange returned no access_token: ${json.error_description ?? json.error ?? "unknown"}`,
    );
  }
  return json.access_token;
}

/** Fetch the authenticated GitHub user's login. Throws on failure. */
export async function fetchGitHubLogin(accessToken: string): Promise<string> {
  const res = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`GET /user failed: ${res.status}`);
  }
  const user = (await res.json()) as { login?: string };
  if (!user.login) {
    throw new Error("GET /user returned no login");
  }
  return user.login;
}

/**
 * Check whether a GitHub user has write or admin access to {org}/gov-bb.
 * Returns true if write/admin, false if not a collaborator or insufficient
 * permission. Throws only on unexpected (non-403/404) failures.
 */
export async function userHasRepoWriteAccess(args: {
  accessToken: string;
  org: string;
  login: string;
}): Promise<boolean> {
  const url = `https://api.github.com/repos/${encodeURIComponent(args.org)}/${REPO_NAME}/collaborators/${encodeURIComponent(args.login)}/permission`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
    },
  });
  // 404 = not a collaborator; 403 = token can't see the repo.
  if (res.status === 404 || res.status === 403) {
    return false;
  }
  if (!res.ok) {
    throw new Error(`Permission check failed: ${res.status}`);
  }
  const perm = (await res.json()) as { permission?: string };
  return perm.permission === "write" || perm.permission === "admin";
}

/**
 * Check whether a GitHub user is an active member of {org}/{teamSlug}.
 * Returns true only when the membership state is "active" (a "pending"
 * invitation does NOT grant access), false if not a member or the token can't
 * see the org/team. Throws only on unexpected (non-403/404) failures.
 */
export async function userIsTeamMember(args: {
  accessToken: string;
  org: string;
  teamSlug: string;
  login: string;
}): Promise<boolean> {
  const url = `https://api.github.com/orgs/${encodeURIComponent(args.org)}/teams/${encodeURIComponent(args.teamSlug)}/memberships/${encodeURIComponent(args.login)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
    },
  });
  // 404 = not a member; 403 = token can't see the org/team.
  if (res.status === 404 || res.status === 403) {
    return false;
  }
  if (!res.ok) {
    throw new Error(`Team membership check failed: ${res.status}`);
  }
  const body = (await res.json()) as { state?: string };
  return body.state === "active";
}
