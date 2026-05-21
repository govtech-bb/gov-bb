/**
 * Walks recipes/ and verifies that every JSON file is in canonical form.
 * Fails non-zero on any drift so CI catches hand-edited or mis-formatted
 * recipes before they merge.
 *
 * Usage:
 *   pnpm run lint:recipes
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { canonicalizeRecipe } from "@govtech-bb/form-types";

async function* walkJson(dir: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkJson(full);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      yield full;
    }
  }
}

async function main(): Promise<void> {
  const root = path.resolve(
    process.env.RECIPES_DIR ?? path.join(process.cwd(), "recipes"),
  );

  const offenders: string[] = [];
  let checked = 0;

  for await (const file of walkJson(root)) {
    checked++;
    const original = await fs.readFile(file, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(original);
    } catch (err) {
      console.error(`✗ ${file}: invalid JSON (${(err as Error).message})`);
      offenders.push(file);
      continue;
    }
    const expected = canonicalizeRecipe(parsed);
    if (original !== expected) {
      offenders.push(file);
      console.error(`✗ ${file}: not in canonical form`);
    }
  }

  if (offenders.length > 0) {
    console.error(
      `\n${offenders.length} of ${checked} recipe file(s) failed lint. Re-run scripts/export-recipes-to-files.ts or fix by hand.`,
    );
    process.exit(1);
  }

  console.log(`✓ ${checked} recipe file(s) in canonical form`);
}

main().catch((err) => {
  console.error("Lint failed:", err);
  process.exitCode = 1;
});
