import { Router } from "express";
import {
  deployBranchName,
  type ServiceContractRecipe,
} from "@govtech-bb/form-types";

export const publishRouter = Router();

const REPO_OWNER = "govtech-bb";
const REPO_NAME = "gov-bb";
const BASE_BRANCH = "dev";
const GH_API = "https://api.github.com";

function repoUrl(suffix: string): string {
  return `${GH_API}/repos/${REPO_OWNER}/${REPO_NAME}${suffix}`;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// POST /builder/publish — create a GitHub PR with the recipe
publishRouter.post("/", async (req, res) => {
  try {
    const { recipe, description, githubToken } = req.body;
    if (!recipe || !githubToken) {
      res.status(400).json({ error: "recipe and githubToken are required" });
      return;
    }
    const typedRecipe = recipe as ServiceContractRecipe;
    const token = githubToken as string;

    // Get dev tip SHA
    const refRes = await fetch(repoUrl(`/git/ref/heads/${BASE_BRANCH}`), {
      headers: authHeaders(token),
    });
    if (!refRes.ok) {
      res
        .status(502)
        .json({ error: `Failed to read dev branch: ${refRes.status}` });
      return;
    }
    const refJson = (await refRes.json()) as { object: { sha: string } };
    const baseSha = refJson.object.sha;

    // Create branch
    const branch = deployBranchName(typedRecipe.formId, typedRecipe.version);
    const createRefRes = await fetch(repoUrl("/git/refs"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    });
    if (!createRefRes.ok) {
      res
        .status(502)
        .json({ error: `Failed to create branch: ${createRefRes.status}` });
      return;
    }

    try {
      // Write recipe file
      const contentsPath = `/contents/recipes/${typedRecipe.formId}/${typedRecipe.version}.json`;
      const fileContent = JSON.stringify(typedRecipe, null, 2) + "\n";
      const putRes = await fetch(repoUrl(contentsPath), {
        method: "PUT",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Publish ${typedRecipe.formId} v${typedRecipe.version}`,
          content: Buffer.from(fileContent, "utf8").toString("base64"),
          branch,
        }),
      });
      if (!putRes.ok) {
        throw new Error(`Failed to write recipe: ${putRes.status}`);
      }

      // Open PR
      const prRes = await fetch(repoUrl("/pulls"), {
        method: "POST",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({
          base: BASE_BRANCH,
          head: branch,
          title: `Publish form: ${typedRecipe.title ?? typedRecipe.formId} v${typedRecipe.version}`,
          body: description ?? "",
        }),
      });
      if (!prRes.ok) {
        throw new Error(`Failed to open PR: ${prRes.status}`);
      }
      const prJson = (await prRes.json()) as {
        number: number;
        html_url: string;
      };
      res.json({ prUrl: prJson.html_url, prNumber: prJson.number });
    } catch (err: any) {
      // Cleanup branch on failure
      await fetch(repoUrl(`/git/refs/heads/${branch}`), {
        method: "DELETE",
        headers: authHeaders(token),
      }).catch(() => {});
      res.status(500).json({ error: err.message });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
