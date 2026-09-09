#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  serializeRecipe,
  serviceContractRecipeSchema,
} from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import {
  checkRegistryRefsResolve,
  checkNoMigratedSlashRefs,
  checkNoOrphanRefsInLatest,
  refsOf,
  type RefLocation,
} from "./recipe-ref-guards";
import { checkWebhookRecipe } from "./webhook-recipe-guards";
import { checkFileFieldsDeclareTypes } from "./file-field-guards";

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

// `--write` normalizes files in place instead of only reporting them, so a
// hand edit or a /form-design session can canonicalize its own recipe in the
// same PR rather than leaving the drift for the next Deploy to absorb.
const WRITE = process.argv.includes("--write");

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
  const nonCanonical: string[] = [];
  const rewritten: string[] = [];
  const allRefs: RefLocation[] = [];

  for (const file of files) {
    const filePath = path.join(RECIPES_ROOT, file);
    const relative = path.relative(process.cwd(), filePath);
    let parsed: unknown;
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf8");
      parsed = JSON.parse(raw);
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

    // Canonical serialization (#2487). Deliberately compares the file's exact
    // bytes, not just key order, so the trailing newline and 2-space indent are
    // covered too — this is a formatter check, and `--write` is its fixer.
    // Canonicalizes `parsed` (the raw JSON), never `result.data`: Zod strips
    // unknown keys, and dropping a field the schema does not enumerate is the
    // #2397 data loss this must not cause.
    const canonical = serializeRecipe(parsed);
    if (canonical !== raw) {
      if (WRITE) {
        await fs.writeFile(filePath, canonical);
        rewritten.push(relative);
      } else {
        nonCanonical.push(relative);
      }
    }

    errors.push(...checkWebhookRecipe(recipe, relative));
    errors.push(...checkFileFieldsDeclareTypes(recipe, relative));
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

  if (rewritten.length > 0) {
    console.log(`Normalized ${rewritten.length} recipe file(s):`);
    for (const f of rewritten) console.log(`  - ${f}`);
  }

  // Non-blocking on purpose: recipes converge lazily, each normalizing the
  // first time it is next deployed or hand-edited, so failing here today would
  // red-flag PRs that did not cause the drift. Once this count reaches 0 the
  // check should become an error so hand edits cannot reintroduce it.
  if (nonCanonical.length > 0) {
    console.warn(
      `\nWarning: ${nonCanonical.length} recipe file(s) are not in canonical form (#2487).`,
    );
    console.warn("Run `pnpm validate-recipes --write` to normalize them.");
    for (const f of nonCanonical) console.warn(`  - ${f}`);
  }

  console.log(`Validated ${recipeCount} recipe file(s). OK.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
