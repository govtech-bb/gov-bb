#!/usr/bin/env node
/**
 * Recipe `updatedAt` guard (#2878).
 *
 * The form builder decides whether a draft row is stale by comparing the
 * row's `updated_at` with the committed recipe's own `updatedAt` (ADR 0075 as
 * amended by #2878). That only holds if every change to a recipe's content
 * moves `updatedAt` forward: the builder's Deploy stamps it at the write, but
 * a hand edit in a PR can forget. This fails when a flat recipe file's content
 * changed against a base revision while `updatedAt` stayed put or moved back.
 * "Content" is everything but `updatedAt`, compared as parsed JSON — a change
 * that only reformats the file passes, as does a recipe the base lacks.
 *
 * Two modes, both over the canonical flat `recipes/{formId}.json` files only:
 *   --base <ref>   (default origin/main) the merge base of <ref> and HEAD,
 *                  against the working tree — what CI runs on a PR.
 *   --staged       HEAD against the index, for the files lint-staged passes
 *                  (or every staged recipe when none are) — the pre-commit
 *                  hook.
 *
 * Deliberately not an nx target: nx's `default` inputs skip content-only
 * changes, so this has to be an always-run step (ci.yml "Validate Recipes"
 * and `lint-staged` in the root package.json). It applies from the change
 * that added it onwards; recipes whose `updatedAt` predates earlier hand
 * edits are not revisited.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { isDeepStrictEqual } from "node:util";

export const RECIPES_DIR = "apps/api/src/forms/form-definitions/recipes";

/**
 * The canonical flat `recipes/{formId}.json`; the legacy versioned
 * `recipes/{formId}/{version}.json` files are frozen and never checked.
 */
export function isFlatRecipeFile(relPath: string): boolean {
  const posix = relPath.split(path.sep).join("/");
  return path.posix.dirname(posix) === RECIPES_DIR && posix.endsWith(".json");
}

function parseStamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * null when `after` may replace `before`; otherwise the error to report.
 * `before` is null for a file the base revision does not have.
 */
export function checkUpdatedAtBumped(
  before: string | null,
  after: string,
  where: string,
): string | null {
  if (before === null) return null;
  let prev: unknown;
  let next: unknown;
  try {
    prev = JSON.parse(before);
    next = JSON.parse(after);
  } catch (err) {
    return `${where}: invalid JSON — ${(err as Error).message}`;
  }
  if (!isRecord(prev) || !isRecord(next)) {
    return `${where}: a recipe must be a JSON object`;
  }
  const { updatedAt: prevStamp, ...prevContent } = prev;
  const { updatedAt: nextStamp, ...nextContent } = next;
  if (isDeepStrictEqual(prevContent, nextContent)) return null;

  const fix = `set it to the time of this edit, e.g. "${new Date().toISOString()}"`;
  const nextTime = parseStamp(nextStamp);
  if (nextTime === null) {
    const what =
      nextStamp === undefined
        ? "missing"
        : `not a date (${JSON.stringify(nextStamp)})`;
    return `${where}: content changed but updatedAt is ${what} — ${fix}`;
  }
  const prevTime = parseStamp(prevStamp);
  if (prevTime !== null && nextTime <= prevTime) {
    const what =
      nextTime === prevTime
        ? `was not bumped (still ${JSON.stringify(nextStamp)})`
        : `moved back (${JSON.stringify(prevStamp)} → ${JSON.stringify(nextStamp)})`;
    return `${where}: content changed but updatedAt ${what} — ${fix}`;
  }
  return null;
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

/** `git show <spec>`, or null when the object does not exist. */
function gitShow(spec: string): string | null {
  try {
    return execFileSync("git", ["show", spec], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  const staged = argv.includes("--staged");
  const baseIndex = argv.indexOf("--base");
  const baseRef = baseIndex === -1 ? "origin/main" : argv[baseIndex + 1];
  if (!baseRef || baseRef.startsWith("--")) {
    console.error("--base needs a ref, e.g. --base origin/main");
    process.exit(2);
  }
  const positional = argv.filter(
    (arg, i) => !arg.startsWith("--") && argv[i - 1] !== "--base",
  );

  const root = git(["rev-parse", "--show-toplevel"]).trim();
  const toRel = (file: string) =>
    path.relative(root, path.resolve(file)).split(path.sep).join("/");

  let files: string[];
  let before: (file: string) => string | null;
  let after: (file: string) => string | null;
  if (staged) {
    files =
      positional.length > 0
        ? positional.map(toRel)
        : git([
            "diff",
            "--cached",
            "--name-only",
            "--diff-filter=AM",
            "--",
            RECIPES_DIR,
          ])
            .split("\n")
            .filter(Boolean);
    before = (file) => gitShow(`HEAD:${file}`);
    after = (file) => gitShow(`:${file}`);
  } else {
    let mergeBase: string;
    try {
      mergeBase = git(["merge-base", baseRef, "HEAD"]).trim();
    } catch {
      console.error(
        `Cannot find the merge base of ${baseRef} and HEAD — fetch the base first (git fetch origin main).`,
      );
      process.exit(2);
    }
    files = git([
      "diff",
      "--name-only",
      "--diff-filter=AM",
      mergeBase,
      "--",
      RECIPES_DIR,
    ])
      .split("\n")
      .filter(Boolean);
    before = (file) => gitShow(`${mergeBase}:${file}`);
    after = (file) => {
      try {
        return fs.readFileSync(path.join(root, file), "utf8");
      } catch {
        return null;
      }
    };
  }

  const recipes = files.filter(isFlatRecipeFile);
  const errors: string[] = [];
  for (const file of recipes) {
    const next = after(file);
    if (next === null) continue; // removed since the diff was listed
    const error = checkUpdatedAtBumped(before(file), next, file);
    if (error) errors.push(error);
  }

  if (errors.length > 0) {
    console.error(
      `Found ${errors.length} recipe file(s) whose content changed without bumping updatedAt (#2878):`,
    );
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(
    `Checked ${recipes.length} changed recipe file(s) for an updatedAt bump. OK.`,
  );
}

// Only run main() when executed directly, not when imported by the spec.
// Root package.json has no `"type": "module"`, so this file runs as CJS
// under tsx (and vitest) — `require.main === module` works.
if (require.main === module) main();
