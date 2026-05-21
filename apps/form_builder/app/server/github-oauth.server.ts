/**
 * GitHub OAuth (user-to-server) helpers. Used by the /auth routes only.
 *
 * Flow:
 *   1. /auth/login → buildAuthorizeUrl(state), store state in session cookie,
 *      302 to GitHub.
 *   2. GitHub → /auth/callback?code=…&state=…
 *   3. /auth/callback → exchangeCodeForToken(code), fetchUserInfo(token),
 *      write session, 302 to /builder.
 */

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const DEFAULT_ORG_LOGIN = "govtech-bb";
const DEFAULT_TOKEN_TTL_SECONDS = 8 * 60 * 60;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set`);
  return v;
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GITHUB_APP_CLIENT_ID"),
    redirect_uri: `${requireEnv("BUILDER_BASE_URL")}/auth/callback`,
    state,
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

export interface TokenExchangeResult {
  accessToken: string;
  expiresAt: number;
}

export async function exchangeCodeForToken(
  code: string,
): Promise<TokenExchangeResult> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: requireEnv("GITHUB_APP_CLIENT_ID"),
      client_secret: requireEnv("GITHUB_APP_CLIENT_SECRET"),
      code,
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (body.error || !body.access_token) {
    throw new Error(
      `GitHub token exchange returned error: ${body.error ?? "no access_token"} ${body.error_description ?? ""}`.trim(),
    );
  }
  const expiresIn = body.expires_in ?? DEFAULT_TOKEN_TTL_SECONDS;
  return {
    accessToken: body.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

export interface UserInfo {
  login: string;
  teamMemberships: string[];
}

export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "govtech-bb-form-builder",
    },
  });
  if (!userRes.ok) {
    throw new Error(`GitHub /user failed: HTTP ${userRes.status}`);
  }
  const user = (await userRes.json()) as { login: string };

  // /user/teams returns teams the authenticated user is a member of across all
  // orgs they can see. Filter to the configured org so a slug collision in a
  // different org can't grant publish rights here.
  const org = process.env.GITHUB_ORG_LOGIN ?? DEFAULT_ORG_LOGIN;
  const teamsRes = await fetch(
    "https://api.github.com/user/teams?per_page=100",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "govtech-bb-form-builder",
      },
    },
  );
  const teams = teamsRes.ok
    ? ((await teamsRes.json()) as Array<{
        slug: string;
        organization: { login: string };
      }>)
    : [];
  const teamMemberships = teams
    .filter((t) => t.organization.login.toLowerCase() === org.toLowerCase())
    .map((t) => t.slug);

  return { login: user.login, teamMemberships };
}
