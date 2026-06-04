#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import {
  checkRegistryRefsResolve,
  checkNoMigratedSlashRefs,
  checkNoOrphanRefsInLatest,
  compareSemver,
  refsOf,
  type RefLocation,
} from "./recipe-ref-guards";

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
  let formDirs: string[];
  try {
    const entries = await fs.readdir(RECIPES_ROOT, { withFileTypes: true });
    formDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
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
  const latestRefs: RefLocation[] = [];

  for (const formId of formDirs) {
    const dir = path.join(RECIPES_ROOT, formId);
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    if (files.length === 0) continue;

    // The highest-semver file is the one the loader serves by default.
    const latestFile = files.reduce((best, file) =>
      compareSemver(file.replace(/\.json$/, ""), best.replace(/\.json$/, "")) >
      0
        ? file
        : best,
    );

    for (const file of files) {
      const filePath = path.join(dir, file);
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

      const filenameVersion = file.replace(/\.json$/, "");
      if (filenameVersion !== recipe.version) {
        errors.push(
          `${relative}: filename version "${filenameVersion}" does not match recipe.version "${recipe.version}"`,
        );
        continue;
      }
      if (recipe.formId !== formId) {
        errors.push(
          `${relative}: directory name "${formId}" does not match recipe.formId "${recipe.formId}"`,
        );
        continue;
      }
      recipeCount++;

      const where = `${formId}/${file}`;
      const refs = refsOf(recipe, where);
      allRefs.push(...refs);
      if (file === latestFile) latestRefs.push(...refs);
    }
  }

  // Ref guards run across every valid recipe collected above.
  errors.push(...checkRegistryRefsResolve(allRefs, BUILTIN_REGISTRY));
  errors.push(...checkNoMigratedSlashRefs(allRefs));
  errors.push(...checkNoOrphanRefsInLatest(latestRefs));

  if (errors.length > 0) {
    console.error(`Found ${errors.length} recipe validation error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(
    `Validated ${recipeCount} recipe file(s) across ${formDirs.length} form(s). OK.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
