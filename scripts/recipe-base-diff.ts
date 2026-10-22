/**
 * The changed canonical flat recipes and their before/after text, shared by
 * the recipe guards that compare a recipe against a base revision
 * (validate-recipe-updated-at.ts, validate-recipe-removals.ts).
 *
 * Two modes:
 *   --base <ref>   (default origin/main) the merge base of <ref> and HEAD,
 *                  against the working tree — what CI runs on a PR.
 *   --staged       HEAD against the index, for the files lint-staged passes
 *                  (or every staged recipe when none are) — the pre-commit
 *                  hook.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export const RECIPES_DIR = "apps/api/src/forms/form-definitions/recipes";

/**
 * The canonical flat `recipes/{formId}.json`; the legacy versioned
 * `recipes/{formId}/{version}.json` files are frozen and never checked.
 */
export function isFlatRecipeFile(relPath: string): boolean {
  const posix = relPath.split(path.sep).join("/");
  return path.posix.dirname(posix) === RECIPES_DIR && posix.endsWith(".json");
}

/** `git <args>` in `cwd`, stdout as text. */
export const gitIn = (cwd: string) => (args: string[]) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

export interface ChangedRecipe {
  /** Repo-relative path. */
  file: string;
  /** The base revision's text, or null when the base lacks the file. */
  before: string | null;
  /** The working tree's (or index's) text, or null when removed since the diff was listed. */
  after: string | null;
}

/**
 * The flat recipes changed (added or modified — a rename lists as an add, so
 * a renamed-and-edited recipe is still checked) under the mode in `argv` in the
 * repository at `cwd`, and the base revision they are compared against.
 * Throws on a usage error or a base it cannot resolve.
 */
export function changedRecipes(
  argv: string[],
  cwd: string,
): { baseRev: string; recipes: ChangedRecipe[] } {
  const git = gitIn(cwd);
  /** `git show <spec>`, or null when the object does not exist. */
  const gitShow = (spec: string): string | null => {
    try {
      return git(["show", spec]);
    } catch {
      return null;
    }
  };

  const staged = argv.includes("--staged");
  const baseIndex = argv.indexOf("--base");
  const baseRef = baseIndex === -1 ? "origin/main" : argv[baseIndex + 1];
  if (!baseRef || baseRef.startsWith("--")) {
    throw new Error("--base needs a ref, e.g. --base origin/main");
  }
  const positional = argv.filter(
    (arg, i) => !arg.startsWith("--") && argv[i - 1] !== "--base",
  );

  const root = git(["rev-parse", "--show-toplevel"]).trim();
  const toRel = (file: string) =>
    path.relative(root, path.resolve(cwd, file)).split(path.sep).join("/");

  let files: string[];
  let baseRev: string;
  let after: (file: string) => string | null;
  if (staged) {
    files =
      positional.length > 0
        ? positional.map(toRel)
        : git([
            "diff",
            "--cached",
            "--name-only",
            "--no-renames",
            "--diff-filter=AM",
            "--",
            RECIPES_DIR,
          ])
            .split("\n")
            .filter(Boolean);
    baseRev = "HEAD";
    after = (file) => gitShow(`:${file}`);
  } else {
    try {
      baseRev = git(["merge-base", baseRef, "HEAD"]).trim();
    } catch {
      throw new Error(
        `Cannot find the merge base of ${baseRef} and HEAD — fetch the base first (git fetch origin main).`,
      );
    }
    files = git([
      "diff",
      "--name-only",
      "--no-renames",
      "--diff-filter=AM",
      baseRev,
      "--",
      RECIPES_DIR,
    ])
      .split("\n")
      .filter(Boolean);
    after = (file) => {
      try {
        return fs.readFileSync(path.join(root, file), "utf8");
      } catch {
        return null;
      }
    };
  }

  return {
    baseRev,
    recipes: files.filter(isFlatRecipeFile).map((file) => ({
      file,
      before: gitShow(`${baseRev}:${file}`),
      after: after(file),
    })),
  };
}
