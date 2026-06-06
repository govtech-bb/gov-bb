#!/usr/bin/env node
// scripts/recipe-version-guard.ts
/**
 * PR gate for #873: recipe versions are immutable and unique across open PRs.
 *
 * Rules (recipe files = apps/api/src/forms/form-definitions/recipes/<id>/<semver>.json):
 *   1. Modifying or renaming an existing recipe version FAILS — a changed
 *      recipe must ship as a new version. Override: `recipe-version-override`
 *      label on the PR (labels are read live from the API, so "add the label +
 *      re-run the failed check" works without pushing a new commit).
 *      Deletions are always allowed (erase / revert flows).
 *   2. Adding a version that an OLDER open PR (same base) also adds FAILS —
 *      the earlier claim wins; this PR must re-bump. No override: two PRs for
 *      one version is never legitimate. The older PR stays green (symmetric
 *      failure would deadlock both).
 *
 * Inputs (env, set by the workflow):
 *   - GITHUB_EVENT_PATH: pull_request event payload JSON.
 *   - GITHUB_TOKEN:      token with pull-requests: read.
 *   - GITHUB_REPOSITORY: owner/repo.
 */
import * as fs from "node:fs";

export const RECIPE_PATH_PATTERN =
  /^apps\/api\/src\/forms\/form-definitions\/recipes\/([a-z0-9][a-z0-9-]*)\/([0-9]+\.[0-9]+\.[0-9]+)\.json$/;

export interface ChangedFile {
  filename: string;
  status: string; // "added" | "modified" | "removed" | "renamed" | "changed" | ...
  previous_filename?: string;
}

export interface OpenPr {
  number: number;
  files: ChangedFile[];
}

const isRecipePath = (p: string): boolean => RECIPE_PATH_PATTERN.test(p);

const recipeAdds = (files: ChangedFile[]): string[] =>
  files
    .filter((f) => f.status === "added" && isRecipePath(f.filename))
    .map((f) => f.filename);

export function findGuardViolations(args: {
  prNumber: number;
  changedFiles: ChangedFile[];
  openPrs: OpenPr[];
  hasOverrideLabel: boolean;
}): string[] {
  const { prNumber, changedFiles, openPrs, hasOverrideLabel } = args;
  const violations: string[] = [];

  for (const f of changedFiles) {
    const touchesRecipe =
      isRecipePath(f.filename) ||
      (f.previous_filename !== undefined && isRecipePath(f.previous_filename));
    if (!touchesRecipe) continue;

    // Rule 1 — immutability. "removed" is the erase/revert flow; "added" is the
    // publish flow; everything else rewrites a shipped version in place.
    if (f.status !== "added" && f.status !== "removed" && !hasOverrideLabel) {
      violations.push(
        `${f.filename}: recipe versions are immutable — ship the change as a new version, ` +
          `or add the "recipe-version-override" label if this edit is intentional.`,
      );
    }
  }

  // Rule 2 — cross-PR version collision, older PR wins.
  const myAdds = new Set(recipeAdds(changedFiles));
  for (const other of openPrs) {
    if (other.number >= prNumber) continue; // only an OLDER PR's claim blocks us
    for (const path of recipeAdds(other.files)) {
      if (myAdds.has(path)) {
        violations.push(
          `${path}: this recipe version is already claimed by open PR #${other.number} — ` +
            `bump to a new version (the earlier PR's claim wins).`,
        );
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

const GH_API = "https://api.github.com";

async function ghJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok)
    throw new Error(
      `GitHub API ${res.status} for ${url}: ${(await res.text()).slice(0, 300)}`,
    );
  return (await res.json()) as T;
}

/** Paginate a GitHub list endpoint (100/page, hard cap 10 pages — logged if hit). */
async function ghPaged<T>(
  base: string,
  token: string,
  log: (m: string) => void,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 10; page++) {
    const sep = base.includes("?") ? "&" : "?";
    const batch = await ghJson<T[]>(
      `${base}${sep}per_page=100&page=${page}`,
      token,
    );
    out.push(...batch);
    if (batch.length < 100) return out;
  }
  log(
    `WARN: pagination cap (1000 items) hit for ${base} — results may be incomplete.`,
  );
  return out;
}

async function main(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // owner/repo
  if (!eventPath || !token || !repo) {
    console.error(
      "GITHUB_EVENT_PATH, GITHUB_TOKEN and GITHUB_REPOSITORY are required.",
    );
    process.exit(1);
  }

  const event = JSON.parse(fs.readFileSync(eventPath, "utf8")) as {
    number?: number;
    pull_request?: { base?: { ref?: string } };
  };
  const prNumber = event.number;
  const baseRef = event.pull_request?.base?.ref;
  if (!prNumber || !baseRef) {
    console.error("Not a pull_request event payload; nothing to check.");
    process.exit(1);
  }

  // Labels are read LIVE (not from the event payload): the workflow doesn't
  // retrigger on `labeled`, so the override path is "add the label, then
  // re-run the failed check" — a stale payload would never see the new label.
  const pr = await ghJson<{ labels?: { name: string }[] }>(
    `${GH_API}/repos/${repo}/pulls/${prNumber}`,
    token,
  );
  const hasOverrideLabel = (pr.labels ?? []).some(
    (l) => l.name === "recipe-version-override",
  );

  const changedFiles = await ghPaged<ChangedFile>(
    `${GH_API}/repos/${repo}/pulls/${prNumber}/files`,
    token,
    console.log,
  );

  // Cheap early exit: most PRs touch no recipes, so skip the open-PR sweep.
  const touchesRecipes = changedFiles.some(
    (f) =>
      isRecipePath(f.filename) ||
      (f.previous_filename !== undefined && isRecipePath(f.previous_filename)),
  );
  if (!touchesRecipes) {
    console.log("No recipe files touched. OK.");
    return;
  }

  // Only fetch other PRs' files when we add a recipe version (rule 2 needs it).
  const openPrs: OpenPr[] = [];
  if (recipeAdds(changedFiles).length > 0) {
    const prs = await ghPaged<{ number: number }>(
      `${GH_API}/repos/${repo}/pulls?state=open&base=${encodeURIComponent(baseRef)}`,
      token,
      console.log,
    );
    for (const pr of prs) {
      if (pr.number === prNumber) continue;
      const files = await ghPaged<ChangedFile>(
        `${GH_API}/repos/${repo}/pulls/${pr.number}/files`,
        token,
        console.log,
      );
      openPrs.push({ number: pr.number, files });
    }
  }

  const violations = findGuardViolations({
    prNumber,
    changedFiles,
    openPrs,
    hasOverrideLabel,
  });
  if (violations.length > 0) {
    console.error(
      `Found ${violations.length} recipe version guard violation(s):`,
    );
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(`Recipe version guard passed for PR #${prNumber}. OK.`);
}

// Only run main() when executed directly, not when imported by tests (CJS —
// same pattern as archive-merged-drafts.ts).
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
