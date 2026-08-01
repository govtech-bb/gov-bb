#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { hydrateRecipeForPreview } from "../apps/api/src/registry/preview-contract";

// Same recipes dir the API loader, validate-recipes, and the Dockerfile point
// at. Resolve from this file's location (tsx provides __dirname) so it works
// regardless of cwd — matching scripts/validate-recipes.ts.
const RECIPES_ROOT = path.resolve(
  __dirname,
  "../apps/api/src/forms/form-definitions/recipes",
);

// Bundled into the forms preview build (see apps/forms preview-contracts.ts).
// Git-ignored; the dir itself is kept via .gitkeep.
const OUTPUT_ROOT = path.resolve(__dirname, "../apps/forms/contracts/preview");

async function main(): Promise<void> {
  const entries = await fs.readdir(RECIPES_ROOT, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name);

  await fs.mkdir(OUTPUT_ROOT, { recursive: true });

  let count = 0;
  for (const file of files) {
    const raw = JSON.parse(
      await fs.readFile(path.join(RECIPES_ROOT, file), "utf8"),
    );
    const recipe = serviceContractRecipeSchema.parse(raw);
    const contract = await hydrateRecipeForPreview(recipe);
    await fs.writeFile(
      path.join(OUTPUT_ROOT, `${recipe.formId}.json`),
      `${JSON.stringify(contract, null, 2)}\n`,
    );
    count++;
  }
  console.log(`Generated ${count} preview contract(s) into ${OUTPUT_ROOT}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
