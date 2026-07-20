/**
 * GitHub-identity verification for admin endpoints that trust a forwarded
 * GitHub access token instead of a shared static token. The feature-flagging
 * tool signs the user in via GitHub OAuth and forwards their access token; this
 * module validates it and (in production) checks org/team membership, so the
 * API knows the real caller and records an unspoofable audit author.
 */

const GITHUB_USER_URL = "https://api.github.com/user";
const REPO_NAME = "gov-bb";
const USER_AGENT = "gov-bb-api";

const GH_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": USER_AGENT,
});

/** Parse `Authorization: Bearer <token>` without regex (avoids ReDoS flags). */
export function extractBearerToken(
  header: string | undefined,
): string | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return undefined;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * The authenticated GitHub user's login, or null if the token is invalid/absent
 * (GitHub returns 401/403). Throws only on unexpected transport failures.
 */
export async function fetchGitHubLogin(token: string): Promise<string | null> {
  const res = await fetch(GITHUB_USER_URL, { headers: GH_HEADERS(token) });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`GitHub GET /user failed: ${res.status}`);
  const user = (await res.json()) as { login?: string };
  return user.login ?? null;
}

/** Active membership of `${org}/${teamSlug}` — a pending invite does not count. */
export async function userIsTeamMember(args: {
  token: string;
  org: string;
  teamSlug: string;
  login: string;
}): Promise<boolean> {
  const url = `https://api.github.com/orgs/${encodeURIComponent(args.org)}/teams/${encodeURIComponent(args.teamSlug)}/memberships/${encodeURIComponent(args.login)}`;
  const res = await fetch(url, { headers: GH_HEADERS(args.token) });
  if (res.status === 404 || res.status === 403) return false;
  if (!res.ok)
    throw new Error(`GitHub team membership check failed: ${res.status}`);
  const body = (await res.json()) as { state?: string };
  return body.state === "active";
}

/** Write/admin access to `${org}/gov-bb`. */
export async function userHasRepoWriteAccess(args: {
  token: string;
  org: string;
  login: string;
}): Promise<boolean> {
  const url = `https://api.github.com/repos/${encodeURIComponent(args.org)}/${REPO_NAME}/collaborators/${encodeURIComponent(args.login)}/permission`;
  const res = await fetch(url, { headers: GH_HEADERS(args.token) });
  if (res.status === 404 || res.status === 403) return false;
  if (!res.ok) throw new Error(`GitHub permission check failed: ${res.status}`);
  const perm = (await res.json()) as { permission?: string };
  return perm.permission === "write" || perm.permission === "admin";
}

/**
 * The membership rule. Local dev (non-production) authorizes any authenticated
 * GitHub user; production requires team membership or repo write access.
 */
export function isMemberAuthorized(args: {
  isDev: boolean;
  isTeamMember: boolean;
  hasRepoWrite: boolean;
}): boolean {
  if (args.isDev) return true;
  return args.isTeamMember || args.hasRepoWrite;
}

/**
 * Validate a forwarded GitHub token and return the authorized login, or null if
 * the token is invalid or the user isn't authorized. Throws only on a server
 * misconfiguration (production without GITHUB_ORG/GITHUB_TEAM_SLUG) or an
 * unexpected GitHub transport error.
 */
export async function authorizeGitHubToken(
  token: string | undefined,
): Promise<string | null> {
  if (!token) return null;
  const login = await fetchGitHubLogin(token);
  if (!login) return null;

  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) return login;

  const org = process.env.GITHUB_ORG;
  const teamSlug = process.env.GITHUB_TEAM_SLUG;
  if (!org || !teamSlug) {
    throw new Error(
      "GITHUB_ORG and GITHUB_TEAM_SLUG must be set to authorize GitHub tokens in production",
    );
  }
  const isTeamMember = await userIsTeamMember({ token, org, teamSlug, login });
  const hasRepoWrite = isTeamMember
    ? false
    : await userHasRepoWriteAccess({ token, org, login });

  return isMemberAuthorized({ isDev, isTeamMember, hasRepoWrite })
    ? login
    : null;
}
