#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  checkNoSupersededNames,
  checkPolyclinicContactBlock,
  findPolyclinicContactLines,
} from "./polyclinic-contact-guards";

// Every path resolves from this file's location, not process.cwd(), for the
// reason validate-recipes.ts gives at its RECIPES_ROOT: a root resolved against
// the wrong cwd finds nothing, and a guard that finds nothing passes (#504).
//
// `src/content` (`.md` only) and the flat recipe files are walked. Nothing
// under `packages/` or `scripts/` is scanned: the guard module and
// `confirmation-markdown.ts` quote the superseded spellings deliberately in
// their doc comments. The pharmacy finder's dataset is the one file read
// outside CONTENT_ROOT and RECIPES_ROOT, for names only: it has no
// Environmental Health contact block, so the block rule doesn't apply. Its
// slugs are left alone — the `winston-scott-polyclinic` slug is a public URL,
// and the name pattern only matches the display spelling (#2719).
const CONTENT_ROOT = path.resolve(__dirname, "../apps/landing/src/content");
const RECIPES_ROOT = path.resolve(
  __dirname,
  "../apps/api/src/forms/form-definitions/recipes",
);
const PHARMACIES_FILE = path.resolve(
  __dirname,
  "../apps/landing/src/routes/health-and-emergency-services/find-an-open-pharmacy/-data/pharmacies.json",
);

async function listFiles(
  root: string,
  ext: string,
  recursive: boolean,
): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true, recursive });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`Directory not found at ${root}.`);
      process.exit(1);
    }
    throw err;
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(ext))
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}

async function main(): Promise<void> {
  const errors: string[] = [];

  const pages = await listFiles(CONTENT_ROOT, ".md", true);
  let pagesWithBlock = 0;
  for (const filePath of pages) {
    const relative = path.relative(process.cwd(), filePath);
    const text = await fs.readFile(filePath, "utf8");
    if (findPolyclinicContactLines(text).length > 0) pagesWithBlock++;
    errors.push(...checkPolyclinicContactBlock(text, relative));
    errors.push(...checkNoSupersededNames(text, relative));
  }

  // Each form is a single flat file `recipes/{formId}.json` (#1196); legacy
  // versioned subdirectories are frozen and never served, so they are skipped
  // the way validate-recipes.ts skips them. Recipes render the contact list
  // through the `{polyclinicContact}` token rather than restating it, so only
  // the name rule applies — it guards the form-builder republish path, which
  // regenerates a recipe from builder state and could carry a hardcoded name
  // back in.
  const recipes = await listFiles(RECIPES_ROOT, ".json", false);
  for (const filePath of recipes) {
    const relative = path.relative(process.cwd(), filePath);
    const text = await fs.readFile(filePath, "utf8");
    errors.push(...checkNoSupersededNames(text, relative));
  }

  // A missing file throws here and main().catch exits 1, so this read can't
  // pass vacuously.
  const pharmaciesRelative = path.relative(process.cwd(), PHARMACIES_FILE);
  errors.push(
    ...checkNoSupersededNames(
      await fs.readFile(PHARMACIES_FILE, "utf8"),
      pharmaciesRelative,
    ),
  );

  // A guard that inspects nothing passes vacuously (#504). Zero is the
  // tripwire, deliberately not today's counts: this runs on every content PR,
  // and a legitimate new EHO service page must not fail it.
  if (pages.length === 0) {
    errors.push(
      `no markdown pages found under ${CONTENT_ROOT} — the guard inspected nothing`,
    );
  } else if (pagesWithBlock === 0) {
    errors.push(
      `none of the ${pages.length} page(s) under ${CONTENT_ROOT} carries a polyclinic contact block — the block guard inspected nothing`,
    );
  }
  if (recipes.length === 0) {
    errors.push(
      `no recipe files found under ${RECIPES_ROOT} — the guard inspected nothing`,
    );
  }

  if (errors.length > 0) {
    console.error(`Found ${errors.length} canonical service name error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(
    `Checked ${pages.length} landing page(s), ${pagesWithBlock} with a polyclinic contact block, ${recipes.length} recipe file(s) and ${pharmaciesRelative}. OK.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
