#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import {
  checkRegistryRefsResolve,
  checkNoMigratedSlashRefs,
  checkNoOrphanRefsInLatest,
  refsOf,
  type RefLocation,
} from "./recipe-ref-guards";
import { checkWebhookRecipe } from "./webhook-recipe-guards";

// Recipes live colocated with the API's form-definitions module — the same
// path the API file loader, the dump script, the Dockerfile, and the form
// builder's publish flow all point at. Resolve from this file's location (not
// process.cwd()) so the always-run CI job and the jest spec agree regardless of
// where they're invoked. The old `process.cwd()/recipes` resolved to nothing,
// so this guard was a silent no-op (the hole behind #504).
const RECIPES_ROOT = path.resolve(
  __dirname,
  "../apps/api/src/forms/form-definitions/recipes",
);

async function main(): Promise<void> {
  // Each form is a single flat file `recipes/{formId}.json` (#1196). Legacy
  // versioned `{formId}/{version}.json` dirs are retained as a read-only
  // runtime fallback until the Phase 2 decommission, but they are frozen and
  // never the served artifact, so validation only covers the flat files.
  let files: string[];
  try {
    const entries = await fs.readdir(RECIPES_ROOT, { withFileTypes: true });
    files = entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`Recipes directory not found at ${RECIPES_ROOT}.`);
      process.exit(1);
    }
    throw err;
  }

  let recipeCount = 0;
  const errors: string[] = [];
  const allRefs: RefLocation[] = [];

  for (const file of files) {
    const filePath = path.join(RECIPES_ROOT, file);
    const relative = path.relative(process.cwd(), filePath);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (err) {
      errors.push(`${relative}: invalid JSON — ${(err as Error).message}`);
      continue;
    }

    const result = serviceContractRecipeSchema.safeParse(parsed);
    if (!result.success) {
      errors.push(
        `${relative}: schema validation failed — ${result.error.message}`,
      );
      continue;
    }
    const recipe = result.data;

    const fileFormId = file.replace(/\.json$/, "");
    if (recipe.formId !== fileFormId) {
      errors.push(
        `${relative}: filename "${fileFormId}" does not match recipe.formId "${recipe.formId}"`,
      );
      continue;
    }
    recipeCount++;

    errors.push(...checkWebhookRecipe(recipe, relative));
    allRefs.push(...refsOf(recipe, file));
  }

  // Every flat file is the canonical (served) recipe, so the orphan-ref guard —
  // which used to apply only to the highest-version file — now runs across all.
  errors.push(...checkRegistryRefsResolve(allRefs, BUILTIN_REGISTRY));
  errors.push(...checkNoMigratedSlashRefs(allRefs));
  errors.push(...checkNoOrphanRefsInLatest(allRefs));

  if (errors.length > 0) {
    console.error(`Found ${errors.length} recipe validation error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`Validated ${recipeCount} recipe file(s). OK.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
