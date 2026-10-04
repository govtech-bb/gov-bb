#!/usr/bin/env node
/**
 * Recipe `updatedAt` guard (#2878).
 *
 * The form builder decides whether a draft row is stale by comparing the
 * row's `updated_at` with the committed recipe's own `updatedAt` (ADR 0075 as
 * amended by #2878). That only holds if every change to a recipe's content
 * moves `updatedAt` forward: the builder's Deploy stamps it at the write, but
 * a hand edit in a PR can forget. This fails when a flat recipe file's content
 * changed against a base revision while `updatedAt` stayed put, moved back, or
 * moved to before the recipe last changed on the base (a token bump of an old
 * stamp). "Content" is everything but `updatedAt`, compared as parsed JSON — a
 * change that only reformats the file passes, as does a recipe the base lacks.
 * Any stamp more than a few minutes in the future fails, content change or
 * not: it would re-sync a draft on every open and outrank every later Deploy.
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
 * and `lint-staged` in apps/api/package.json — lint-staged routes each file
 * to its closest config, so a root-level glob never sees a recipe). The
 * backfill that landed with it set every recipe's `updatedAt` to its last
 * commit date, so the guard holds from there on.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { isRecord, recipeContent } from "./recipe-content";

export const RECIPES_DIR = "apps/api/src/forms/form-definitions/recipes";

/**
 * The canonical flat `recipes/{formId}.json`; the legacy versioned
 * `recipes/{formId}/{version}.json` files are frozen and never checked.
 */
export function isFlatRecipeFile(relPath: string): boolean {
  const posix = relPath.split(path.sep).join("/");
  return path.posix.dirname(posix) === RECIPES_DIR && posix.endsWith(".json");
}

/** How far ahead of the guard's clock a stamp may be — clock skew, no more. */
const MAX_SKEW_MS = 5 * 60_000;

function parseStamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

export interface StampBounds {
  /**
   * When the recipe last changed on the base revision (ISO), or null when the
   * base has no commit touching it. A content change stamped before it is a
   * token bump of an old stamp, not the time of the edit.
   */
  floor: string | null;
  /** The guard's clock. */
  now: Date;
}

/**
 * null when `after` may replace `before`; otherwise the error to report.
 * `before` is null for a file the base revision does not have. "Content" is
 * recipeContent() — the same definition the archive job skips on.
 */
export function checkUpdatedAtBumped(
  before: string | null,
  after: string,
  where: string,
  { floor, now }: StampBounds,
): string | null {
  let prev: unknown;
  let next: unknown;
  try {
    prev = before === null ? null : JSON.parse(before);
    next = JSON.parse(after);
  } catch (err) {
    return `${where}: invalid JSON — ${(err as Error).message}`;
  }
  if ((before !== null && !isRecord(prev)) || !isRecord(next)) {
    return `${where}: a recipe must be a JSON object`;
  }
  const fix = `set it to the time of this edit, e.g. "${now.toISOString()}"`;
  const nextStamp = next.updatedAt;
  const nextTime = parseStamp(nextStamp);
  if (nextTime !== null && nextTime > now.getTime() + MAX_SKEW_MS) {
    return `${where}: updatedAt ${JSON.stringify(nextStamp)} is in the future — ${fix}`;
  }
  if (!isRecord(prev)) return null;
  if (isDeepStrictEqual(recipeContent(prev), recipeContent(next))) return null;
  const prevStamp = prev.updatedAt;

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
  if (floor !== null && nextTime < Date.parse(floor)) {
    return `${where}: content changed but updatedAt ${JSON.stringify(nextStamp)} is earlier than ${floor}, when this recipe last changed on the base — ${fix}`;
  }
  return null;
}

export interface RunResult {
  checked: number;
  errors: string[];
}

/**
 * The guard over `argv` (the CLI's arguments) in the repository at `cwd`.
 * Throws on a usage error or a base it cannot resolve.
 */
export function run(
  argv: string[],
  { cwd, now = new Date() }: { cwd: string; now?: Date },
): RunResult {
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  /** `git show <spec>`, or null when the object does not exist. */
  const gitShow = (spec: string): string | null => {
    try {
      return git(["show", spec]);
    } catch {
      return null;
    }
  };
  /**
   * The committer date of the newest commit on `rev` touching `file` — the
   * floor for a content change's stamp. Not `rev`'s own date: CI checks out
   * the PR merged into main, so the merge base is main's tip, and every
   * unrelated merge would then fail an open PR's earlier stamp.
   */
  const lastChanged = (rev: string, file: string): string | null => {
    const date = git(["log", "-1", "--format=%cI", rev, "--", file]).trim();
    return date ? new Date(date).toISOString() : null;
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

  const recipes = files.filter(isFlatRecipeFile);
  const errors: string[] = [];
  for (const file of recipes) {
    const next = after(file);
    if (next === null) continue; // removed since the diff was listed
    const error = checkUpdatedAtBumped(
      gitShow(`${baseRev}:${file}`),
      next,
      file,
      {
        floor: lastChanged(baseRev, file),
        now,
      },
    );
    if (error) errors.push(error);
  }
  return { checked: recipes.length, errors };
}

function main(): void {
  let result: RunResult;
  try {
    result = run(process.argv.slice(2), { cwd: process.cwd() });
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }
  if (result.errors.length > 0) {
    console.error(
      `Found ${result.errors.length} recipe file(s) whose updatedAt does not record this change (#2878):`,
    );
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(
    `Checked ${result.checked} changed recipe file(s) for an updatedAt bump. OK.`,
  );
}

// Only run main() when executed directly, not when imported by the spec.
// Root package.json has no `"type": "module"`, so this file runs as CJS
// under tsx (and vitest) — `require.main === module` works.
if (require.main === module) main();
