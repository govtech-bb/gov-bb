import { Router } from "express";
import type { Request, Response } from "express";
import {
  deployBranchName,
  type ServiceContractRecipe,
} from "@govtech-bb/form-types";
import { createPublishClient, type GitHubRepo } from "@govtech-bb/git-publish";
import { getDataSource } from "../db.js";
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
  try {
    const { recipe, description, githubToken, userLogin } = req.body;
    if (!recipe || !githubToken) {
      res.status(400).json({ error: "recipe and githubToken are required" });
      return;
    }

    // Server-side backstop (#759): run the same validation the client Deploy
    // gate runs, *before* any GitHub call, so a stale/non-UI client can't open
    // a junk PR that only exists to fail CI. On failure nothing is created, so
    // there's no branch/PR to clean up.
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
      res.status(400).json({ error: "userLogin is required" });
      return;
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
      // to update in place (the Contents API requires `sha` to overwrite).
      const existing = await gh.getContents(token, contentsPath, branch);
      const existingSha = existing.ok
        ? ((await existing.json()) as { sha?: string }).sha
        : undefined;
      const putRes = await gh.putFile(token, {
        path: contentsPath,
        message: `Publish ${typedRecipe.formId}`,
        content: JSON.stringify(typedRecipe, null, 2) + "\n",
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
      // Cleanup branch on failure. `branch` derives from user-provided
      // formId/version (via deployBranchName), so sanitize it at the
      // request-path sink — same rationale as the contents PUT above (#935).
      // Encode per path segment: GitHub matches the ref by literal segments, so
      // the structural `/` in `form-builder/<name>` must survive (whole-string
      // encoding would turn it into %2F and 404 the cleanup, orphaning the
      // branch). For valid input this is a no-op.
      const encodedBranchPath = branch
        .split("/")
        .map(encodeURIComponent)
        .join("/");
      await gh.deleteBranch(token, encodedBranchPath);
      res.status(500).json({ error: err.message });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

publishRouter.post("/", publishHandler);
