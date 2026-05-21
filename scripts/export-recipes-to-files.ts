/**
 * One-shot migration: dump every distinct (formId, version) row from the
 * form_definitions table to recipes/{formId}/{version}.json in canonical form.
 *
 * Re-runnable: produces byte-identical output for the same DB state, so it can
 * be run multiple times during the migration window without churn.
 *
 * Run from the repo root:
 *   pnpm run export:recipes
 *
 * Connection comes from the standard DB_* env vars (matches the API and
 * form_builder), loaded from the repo-root .env. Output directory is
 * RECIPES_DIR or <repoRoot>/recipes.
 */

import "reflect-metadata";
import * as dotenv from "dotenv";
import { promises as fs } from "node:fs";
import * as path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

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
    // createDataSource takes Omit<DataSourceOptions, ...>, which collapses the
    // per-driver discriminated union. Mirrors the workaround in
    // apps/form_builder/app/server/db.ts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  await ds.initialize();
  try {
    const repo = ds.getRepository(FormDefinitionEntity);
    const rows = await repo.find({
      order: { formId: "ASC", version: "ASC" },
    });

    await fs.mkdir(outDir, { recursive: true });

    let written = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!row.formId || !row.version) {
        console.warn(
          `Skipping row id=${row.id} — empty formId/version (formId="${row.formId}", version="${row.version}")`,
        );
        skipped++;
        continue;
      }
      const formDir = path.join(outDir, row.formId);
      await fs.mkdir(formDir, { recursive: true });
      const file = path.join(formDir, `${row.version}.json`);
      const content = canonicalizeRecipe(row.schema);
      await fs.writeFile(file, content, "utf8");
      written++;
    }

    const distinct = new Set(
      rows.filter((r) => r.formId && r.version).map((r) => r.formId),
    ).size;
    console.log(
      `Wrote ${written} recipe file(s) under ${outDir} (${distinct} distinct formIds${skipped ? `, ${skipped} skipped` : ""})`,
    );
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exitCode = 1;
});
