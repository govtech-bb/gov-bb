/**
 * The GitHub org that owns the access team. The repo *name* is fixed; the
 * *owner* is env-driven via `GITHUB_ORG` (team-membership + repo-write checks).
 */
export const REPO_NAME = "gov-bb";

export function repoOwner(): string {
  const v = process.env.GITHUB_ORG;
  if (!v) throw new Error("GITHUB_ORG is not set");
  return v;
}
