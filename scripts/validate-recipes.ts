#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";

const RECIPES_ROOT = path.resolve(process.cwd(), "recipes");

async function main(): Promise<void> {
  let formDirs: string[];
  try {
    const entries = await fs.readdir(RECIPES_ROOT, { withFileTypes: true });
    formDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.log("No recipes/ directory found — nothing to validate.");
      return;
    }
    throw err;
  }

  let recipeCount = 0;
  const errors: string[] = [];

  for (const formId of formDirs) {
    const dir = path.join(RECIPES_ROOT, formId);
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
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
    }
  }

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
