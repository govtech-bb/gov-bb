import { Logger } from "@nestjs/common";
import { authorizeGitHubToken, extractBearerToken } from "./github-identity";

const logger = new Logger("includeNonPublicFromAuth");

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
  } catch (err) {
    // Misconfig, GitHub transport error or timeout → fail safe to public-only.
    // Logged because the symptom is otherwise silent: Feature flagging just
    // stops listing non-public forms (#2902). Never log the token itself.
    logger.warn(
      `GitHub authorization failed; serving the public-only list: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return false;
  }
}
