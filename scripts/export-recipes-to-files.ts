/**
 * One-shot migration: dump every distinct (formId, version) row from the
 * form_definitions table to recipes/{formId}/{version}.json in canonical form.
 *
 * Re-runnable: produces byte-identical output for the same DB state, so it can
 * be run multiple times during the migration window without churn.
 *
 * Run from the repo root:
 *   pnpm exec ts-node scripts/export-recipes-to-files.ts
 *
 * Connection comes from the standard DB_* env vars (matches the API and
 * form_builder). Output directory is RECIPES_DIR or <repoRoot>/recipes.
 */

import "reflect-metadata";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { FormDefinitionEntity, createDataSource } from "@govtech-bb/database";
import { canonicalizeRecipe } from "@govtech-bb/form-types";

async function main(): Promise<void> {
  const outDir = path.resolve(
    process.env.RECIPES_DIR ?? path.join(process.cwd(), "recipes"),
  );

  const ds = createDataSource({
    type: "postgres",
    host: process.env.DB_HOST ?? "localhost",
    port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
    username: process.env.DB_USERNAME ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
    database: process.env.DB_NAME ?? "modular_forms",
    synchronize: false,
    logging: process.env.DB_LOGGING === "true",
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });

  await ds.initialize();
  try {
    const repo = ds.getRepository(FormDefinitionEntity);
    const rows = await repo.find({
      order: { formId: "ASC", version: "ASC" },
    });

    await fs.mkdir(outDir, { recursive: true });

    let written = 0;
    for (const row of rows) {
      const formDir = path.join(outDir, row.formId);
      await fs.mkdir(formDir, { recursive: true });
      const file = path.join(formDir, `${row.version}.json`);
      const content = canonicalizeRecipe(row.schema);
      await fs.writeFile(file, content, "utf8");
      written++;
    }

    console.log(
      `Wrote ${written} recipe file(s) under ${outDir} (${new Set(rows.map((r) => r.formId)).size} distinct formIds)`,
    );
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exitCode = 1;
});
