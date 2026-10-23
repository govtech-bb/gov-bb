import { authorizeGitHubToken, extractBearerToken } from "./github-identity";

/**
 * Whether a request may see non-public (preview/draft) entries. Soft auth: it
 * never throws — an unauthenticated (or unauthorized) request simply gets the
 * public-only list. A forwarded GitHub token that resolves to an authorized user
 * (any authenticated user in dev; org/team member in production) unlocks all
 * visibilities. Shared by `GET /services` and `GET /form-definitions` (#2902),
 * the two lists the feature-flagging tool reads with the user's token.
 */
export async function includeNonPublicFromAuth(
  authHeader: string | undefined,
): Promise<boolean> {
  const token = extractBearerToken(authHeader);
  if (!token) return false;
  try {
    return (await authorizeGitHubToken(token)) !== null;
  } catch {
    // Misconfig or GitHub transport error → fail safe to public-only.
    return false;
  }
}
