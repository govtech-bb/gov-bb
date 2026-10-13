#!/usr/bin/env node
/**
 * Recipe removal guard CLI (#2409): fails when a changed flat recipe drops a
 * webhook or MDA-email processor, its catchment routing, a geocodeTargets
 * block or an address lookup against the base revision (see
 * recipe-removal-guards.ts). Same modes as validate-recipe-updated-at.ts
 * (recipe-base-diff.ts); CI runs `--base origin/<target>` from its own
 * workflow, recipe-removal-guard.yml, which the `recipe-removal-override`
 * label skips.
 */
import { changedRecipes } from "./recipe-base-diff";
import { checkRemovals } from "./recipe-removal-guards";

/** Parsed JSON, or null for text that is not JSON (validate-recipes reports that). */
function parse(text: string | null): unknown {
  try {
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

function main(): void {
  let recipes;
  try {
    ({ recipes } = changedRecipes(process.argv.slice(2), process.cwd()));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }
  const errors = recipes.flatMap(({ file, before, after }) =>
    after === null ? [] : checkRemovals(file, parse(before), parse(after)),
  );
  if (errors.length > 0) {
    console.error(
      `Found ${errors.length} removal(s) of recipe delivery, routing or geocoding (#2409):`,
    );
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(
    `Checked ${recipes.length} changed recipe file(s) for removed delivery, routing or geocoding. OK.`,
  );
}

main();
