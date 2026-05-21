import { Octokit } from "@octokit/rest";
import * as crypto from "node:crypto";
import {
  canonicalizeRecipe,
  type ServiceContractRecipe,
} from "@govtech-bb/form-types";

const DEFAULT_OWNER = "govtech-bb";
const DEFAULT_REPO = "gov-bb";
const DEFAULT_BASE_BRANCH = "dev";

export interface OpenPublishPrParams {
  formId: string;
  version: string;
  recipe: ServiceContractRecipe;
  prDescription: string;
  userToken: string;
}

export interface OpenPublishPrResult {
  prUrl: string;
  prNumber: number;
  branchName: string;
}

/**
 * Opens a PR that publishes `recipe` to recipes/{formId}/{version}.json.
 *
 * Steps:
 *   1. Resolve the base branch's HEAD SHA.
 *   2. Create branch formbuilder/publish-{formId}-{version}-{shortHash} off
 *      that SHA. The short hash (SHA256 of formId+version+ISO timestamp,
 *      first 7 chars) keeps concurrent publishes from colliding.
 *   3. PUT contents to recipes/{formId}/{version}.json with the recipe in
 *      canonical form, committed as the authenticated user.
 *   4. Open a PR against the base branch with title "Publish {formId} v{version}".
 *
 * The userToken is the GitHub user-to-server token from the session — using
 * it (rather than an App installation token) makes the staff member the
 * commit author, so `git blame` is meaningful.
 */
export async function openPublishPr(
  params: OpenPublishPrParams,
): Promise<OpenPublishPrResult> {
  const owner = process.env.GITHUB_REPO_OWNER ?? DEFAULT_OWNER;
  const repo = process.env.GITHUB_REPO_NAME ?? DEFAULT_REPO;
  const baseBranch = process.env.GITHUB_PR_BASE_BRANCH ?? DEFAULT_BASE_BRANCH;

  const octokit = new Octokit({ auth: params.userToken });

  const shortHash = crypto
    .createHash("sha256")
    .update(`${params.formId}|${params.version}|${new Date().toISOString()}`)
    .digest("hex")
    .slice(0, 7);
  const branchName = `formbuilder/publish-${params.formId}-${params.version}-${shortHash}`;
  const path = `recipes/${params.formId}/${params.version}.json`;
  const content = canonicalizeRecipe(params.recipe);

  const baseRef = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });
  const baseSha = baseRef.data.object.sha;

  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message: `Publish ${params.formId} v${params.version}`,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: branchName,
  });

  const pr = await octokit.pulls.create({
    owner,
    repo,
    title: `Publish ${params.formId} v${params.version}`,
    head: branchName,
    base: baseBranch,
    body: params.prDescription,
  });

  return {
    prUrl: pr.data.html_url,
    prNumber: pr.data.number,
    branchName,
  };
}
