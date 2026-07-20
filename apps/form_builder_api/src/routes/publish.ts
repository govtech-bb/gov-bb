import { Router } from "express";
import type { Request, Response } from "express";
import {
  deployBranchName,
  type ServiceContractRecipe,
} from "@govtech-bb/form-types";
import {
  createPublishClient,
  createdAtFromContents,
  type GitHubRepo,
} from "@govtech-bb/git-publish";
import { getDataSource } from "../db.js";
import { badRequest } from "../lib/http-error.js";
import { holdsFreshClaim } from "./presence.js";
import { validateRecipeFully } from "./validate-recipe.js";

export const publishRouter = Router();

/**
 * Repo identity for the publish flow. The repo *name* is fixed; the *owner* is
 * env-driven via `GITHUB_ORG` — the same single source of truth form_builder
 * uses (see its `github-repo.ts`). Throws when unset rather than silently
 * publishing to a wrong, hardcoded org, which is exactly the drift this once
 * had (#1400).
 */
function repoIdentity(): GitHubRepo {
  const owner = process.env.GITHUB_ORG;
  if (!owner) throw new Error("GITHUB_ORG is not set");
  return { owner, repo: "gov-bb" };
}

// POST /builder/publish — create a GitHub PR with the recipe
export async function publishHandler(req: Request, res: Response) {
  const { recipe, description, githubToken, userLogin } = req.body;
  if (!recipe || !githubToken) {
    throw badRequest("recipe and githubToken are required");
  }

  // Server-side backstop (#759): run the same validation the client Deploy
  // gate runs, *before* any GitHub call, so a stale/non-UI client can't open
  // a junk PR that only exists to fail CI. On failure nothing is created, so
  // there's no branch/PR to clean up. Keeps its richer { error, issues } body
  // (not routed through the central handler) so a stale client still sees why.
  const validation = await validateRecipeFully(recipe);
  if (!validation.ok) {
    res.status(400).json({
      error: "Recipe failed validation",
      issues: validation.issues,
    });
    return;
  }

  const typedRecipe = recipe as ServiceContractRecipe;
  const token = githubToken as string;

  // Read-only lock (#874): deploying is a write, so only the current fresh
  // claim holder may publish. Require the SSR-stamped login (400) and verify
  // the claim (409) before touching GitHub.
  const login = typeof userLogin === "string" ? userLogin.trim() : "";
  if (!login) {
    throw badRequest("userLogin is required");
  }
  const ds = await getDataSource();
  if (!(await holdsFreshClaim(ds, typedRecipe.formId, login))) {
    res.status(409).json({
      error:
        "Another editor holds this form. Your session is read-only until their claim expires.",
      code: "presence_conflict",
    });
    return;
  }

  // Base branch from env (`PUBLISH_BASE_BRANCH`, default `dev`) — the same
  // override form_builder honours, so both publish surfaces retarget together
  // instead of this one being pinned to a hardcoded `dev`.
  const baseBranch = process.env.PUBLISH_BASE_BRANCH ?? "dev";
  const gh = createPublishClient(repoIdentity());

  // Read the base tip and create the deploy branch off it.
  const branch = deployBranchName(typedRecipe.formId);
  await gh.createBranchFrom(token, baseBranch, branch);

  try {
    // Overwrite the canonical flat recipe file (#1196 — versioning retired).
    // formId is user-provided, so encode the segment as it enters the request
    // path — sink-level sanitization that clears the CodeQL js/request-forgery
    // alert. Backstopped by the kebab `formId` validation in
    // validateRecipeFully; for valid input this is a no-op (#935).
    const contentsPath = `recipes/${encodeURIComponent(typedRecipe.formId)}.json`;
    // The flat file already exists on the base branch, so fetch its blob SHA
    // to update in place (the Contents API requires `sha` to overwrite). The
    // same response carries the committed file's content, so preserve its
    // original `createdAt` rather than restamping it (#1720); `updatedAt`
    // stays at the value the recipe arrived with. On first publish (no
    // existing file) the recipe is written verbatim with its minted stamps.
    const existing = await gh.getContents(token, contentsPath, branch);
    let existingSha: string | undefined;
    let preservedCreatedAt: string | undefined;
    if (existing.ok) {
      const body = (await existing.json()) as {
        sha?: string;
        content?: string;
      };
      existingSha = body.sha;
      preservedCreatedAt = createdAtFromContents(body);
    }
    const recipeToPublish = preservedCreatedAt
      ? { ...typedRecipe, createdAt: preservedCreatedAt }
      : typedRecipe;
    const putRes = await gh.putFile(token, {
      path: contentsPath,
      message: `Publish ${typedRecipe.formId}`,
      content: JSON.stringify(recipeToPublish, null, 2) + "\n",
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    });
    if (!putRes.ok) {
      throw new Error(`Failed to write recipe: ${putRes.status}`);
    }

    const { prUrl, prNumber } = await gh.openPullRequest(token, {
      base: baseBranch,
      head: branch,
      title: `Publish form: ${typedRecipe.title ?? typedRecipe.formId}`,
      body: description ?? "",
    });
    res.json({ prUrl, prNumber });
  } catch (err: any) {
    // Cleanup branch on failure, then re-throw so the central error handler
    // (#1404) sends the 500 — the cleanup is the only reason this catch stays.
    // `branch` derives from user-provided formId/version (via deployBranchName),
    // so sanitize it at the request-path sink — same rationale as the contents
    // PUT above (#935). Encode per path segment: GitHub matches the ref by
    // literal segments, so the structural `/` in `form-builder/<name>` must
    // survive (whole-string encoding would turn it into %2F and 404 the
    // cleanup, orphaning the branch). For valid input this is a no-op.
    const encodedBranchPath = branch
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    await gh.deleteBranch(token, encodedBranchPath);
    throw err;
  }
}

publishRouter.post("/", publishHandler);
