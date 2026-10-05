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

const DEFAULT_BASE_BRANCH = "main";

/**
 * The branch the builder reads committed recipes from and opens its Deploy
 * PRs against, from `PUBLISH_BASE_BRANCH`. Resolution order:
 *   1. The LIVE runtime env var — wins wherever the platform exposes it
 *      (docker, ECS, local node), so changing it retargets deploys with no
 *      rebuild. Read via bracket access on purpose: Vite's `define` only
 *      rewrites the literal `process.env.PUBLISH_BASE_BRANCH`, so the bracket
 *      form survives the build as a real runtime read instead of being inlined.
 *   2. The build-time baked value (`process.env.PUBLISH_BASE_BRANCH_DEFAULT`,
 *      substituted by Vite — see vite.config.ts `define`). This is the fallback
 *      for Amplify Compute, whose SSR Lambda doesn't receive runtime env vars;
 *      set PUBLISH_BASE_BRANCH in the Amplify console and redeploy to change it.
 *   3. `main`, the trunk.
 * This is the single source of truth: the Deploy flow (`publishRecipe`,
 * `getPublishBaseBranch`), the services and content publish paths, and the
 * recipe reads in github-recipes.ts all use it, so the branch a Deploy's
 * stale-base guard compares against is the branch the builder read the recipe
 * from (#2899), and the value the modal shows can never diverge from the PR's
 * actual base. Lives here rather than in publish.ts because github-recipes.ts
 * needs it and publish.ts imports from there.
 */
export function resolveBaseBranch(): string {
  const runtime = process.env["PUBLISH_BASE_BRANCH"]?.trim();
  if (runtime) return runtime;
  return process.env.PUBLISH_BASE_BRANCH_DEFAULT?.trim() || DEFAULT_BASE_BRANCH;
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
