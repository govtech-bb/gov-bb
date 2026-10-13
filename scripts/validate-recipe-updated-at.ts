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
import { isDeepStrictEqual } from "node:util";
import { changedRecipes, gitIn } from "./recipe-base-diff";
import { isRecord, recipeContent } from "./recipe-content";

export { RECIPES_DIR, isFlatRecipeFile } from "./recipe-base-diff";

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
  const git = gitIn(cwd);
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

  const { baseRev, recipes } = changedRecipes(argv, cwd);
  const errors: string[] = [];
  for (const { file, before, after } of recipes) {
    if (after === null) continue; // removed since the diff was listed
    const error = checkUpdatedAtBumped(before, after, file, {
      floor: lastChanged(baseRev, file),
      now,
    });
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
