import { createServerFn } from "@tanstack/react-start";

/**
 * Single source of truth for the GitHub repo this app publishes to.
 *
 * The repo *name* genuinely is fixed; the *owner* is env-driven via
 * `GITHUB_ORG` everywhere (recipes reads, publish flow, OAuth callback,
 * and the access-denied page display). See issue #700.
 */
export const REPO_NAME = "gov-bb";

export function repoOwner(): string {
  const v = process.env.GITHUB_ORG;
  if (!v) throw new Error("GITHUB_ORG is not set");
  return v;
}

export interface RepoDisplay {
  owner: string | null;
  name: string;
}

/**
 * Display variant of the repo identity. Unlike `repoOwner()` this returns
 * `owner: null` instead of throwing when `GITHUB_ORG` is unset — the denied
 * page is the last place that should crash on a config error.
 */
export function repoDisplay(): RepoDisplay {
  return { owner: process.env.GITHUB_ORG ?? null, name: REPO_NAME };
}

export const getRepoDisplay = createServerFn({ method: "GET" }).handler(
  async (): Promise<RepoDisplay> => repoDisplay(),
);
