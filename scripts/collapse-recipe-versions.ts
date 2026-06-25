#!/usr/bin/env node
// One-time migration for #1196 (PR B — cutover). Collapses each versioned
// recipe directory `recipes/{formId}/{version}.json` into a single flat
// canonical file `recipes/{formId}.json` carrying the **highest** version's
// content with the `version` field stripped.
//
// Additive: the legacy versioned dirs are left untouched so the loader's
// Phase-1 fallback still resolves in-flight pinned submissions/drafts. The
// flat file and the dir never collide (`recipes/x.json` vs `recipes/x/1.0.0.json`).
//
// Run once and commit the result: `pnpm exec tsx scripts/collapse-recipe-versions.ts`.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { compareSemver } from "./recipe-ref-guards";

const RECIPES_ROOT = path.resolve(
  __dirname,
  "../apps/api/src/forms/form-definitions/recipes",
);

async function main(): Promise<void> {
  const entries = await fs.readdir(RECIPES_ROOT, { withFileTypes: true });
  const formDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  let written = 0;
  for (const formId of formDirs) {
    const dir = path.join(RECIPES_ROOT, formId);
    const versionFiles = (await fs.readdir(dir)).filter((f) =>
      f.endsWith(".json"),
    );
    if (versionFiles.length === 0) {
      console.warn(`[skip] ${formId}: no version files`);
      continue;
    }

    // Pick the highest semver — the same file the loader serves as "latest".
    const highest = versionFiles
      .map((f) => f.replace(/\.json$/, ""))
      .sort((a, b) => compareSemver(a, b))
      .at(-1)!;

    const raw = await fs.readFile(path.join(dir, `${highest}.json`), "utf8");
    const recipe = JSON.parse(raw) as Record<string, unknown>;
    delete recipe.version;

    const flatPath = path.join(RECIPES_ROOT, `${formId}.json`);
    await fs.writeFile(flatPath, JSON.stringify(recipe, null, 2) + "\n");
    written++;
    console.log(`[ok]   ${formId}.json  (from ${highest})`);
  }

  console.log(`\nWrote ${written} canonical recipe(s); legacy dirs untouched.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
