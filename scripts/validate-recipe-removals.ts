#!/usr/bin/env node
/**
 * Recipe removal guard CLI (#2409): fails when a changed flat recipe drops a
 * webhook processor or MDA delivery email, its catchment routing, a geocodeTargets
 * block or an address lookup against the base revision (see
 * recipe-removal-guards.ts). Same modes as validate-recipe-updated-at.ts
 * (recipe-base-diff.ts); CI runs `--base origin/<target>` from its own
 * workflow, recipe-removal-guard.yml, which the `recipe-removal-override`
 * label skips.
 */
import { changedRecipes } from "./recipe-base-diff";
import { checkRemovals } from "./recipe-removal-guards";

/** Parsed JSON, or undefined for a missing file or text that is not JSON. */
function parse(text: string | null): unknown {
  try {
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The guard over `argv` (the CLI's arguments) in the repository at `cwd`:
 * logs its findings and returns the exit code — 0 clean, 1 a removal, 2 a
 * usage error or a base it cannot resolve.
 */
export function main(argv: string[], cwd: string): number {
  let recipes;
  try {
    ({ recipes } = changedRecipes(argv, cwd));
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
  // An unparseable `after` is skipped (validate-recipes reports invalid
  // JSON); an unparseable `before` has nothing to lose.
  const errors = recipes.flatMap(({ file, before, after }) => {
    const next = parse(after);
    return next === undefined ? [] : checkRemovals(file, parse(before), next);
  });
  if (errors.length > 0) {
    console.error(
      `Found ${errors.length} removal(s) of recipe delivery, routing or geocoding (#2409):`,
    );
    for (const error of errors) console.error(`  - ${error}`);
    return 1;
  }
  console.log(
    `Checked ${recipes.length} changed recipe file(s) for removed delivery, routing or geocoding. OK.`,
  );
  return 0;
}

// Only run main() when executed directly, not when imported by the spec
// (CJS under tsx and vitest, as in validate-recipe-updated-at.ts).
if (require.main === module) {
  process.exitCode = main(process.argv.slice(2), process.cwd());
}
