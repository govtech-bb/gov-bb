import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FormDefinitionEntity } from "@govtech-bb/database";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import { getDataSource } from "./db";
import { bumpMinor } from "../lib/version";
import type { FormDefinitionSummary } from "../types/index";
import { requireAdminToken } from "./auth/admin-token-middleware";

type FormDefinitionRow = {
  id: string;
  version: string;
  schema: ServiceContractRecipe;
  published_at: Date | null;
};

export const listForms = createServerFn({ method: "GET" })
  .middleware([requireAdminToken])
  .handler(async (): Promise<FormDefinitionSummary[]> => {
    const ds = await getDataSource();
    const rows = await ds.query<
      {
        id: string;
        form_id: string;
        title: string;
        version: string;
        published_at: Date | null;
      }[]
    >(`
      SELECT DISTINCT ON (form_id) id, form_id, schema->>'title' AS title, version, published_at
      FROM form_definitions
      ORDER BY form_id, string_to_array(version, '.')::int[] DESC
    `);
    return rows.map((r) => ({
      id: r.id,
      formId: r.form_id,
      title: r.title,
      version: r.version,
      isPublished: r.published_at !== null,
    }));
  });

export const getRecipe = createServerFn({ method: "GET", strict: false })
  .middleware([requireAdminToken])
  .inputValidator(z.object({ formId: z.string() }))
  .handler(async ({ data }): Promise<ServiceContractRecipe> => {
    const ds = await getDataSource();
    const rows = await ds.query<FormDefinitionRow[]>(
      `SELECT id, version, schema, published_at
       FROM form_definitions
       WHERE form_id = $1
       ORDER BY string_to_array(version, '.')::int[] DESC
       LIMIT 1`,
      [data.formId],
    );
    if (!rows.length) {
      throw new Error(`No recipe found for formId: ${data.formId}`);
    }
    return rows[0].schema;
  });

export const submitRecipe = createServerFn({ method: "POST" })
  .middleware([requireAdminToken])
  .inputValidator(
    z.object({
      recipe: z.unknown(),
    }),
  )
  .handler(async ({ data }): Promise<void> => {
    const recipe = data.recipe as ServiceContractRecipe;
    const ds = await getDataSource();
    const repo = ds.getRepository(FormDefinitionEntity);

    const existing = await repo.findOne({
      where: { formId: recipe.formId, version: recipe.version },
    });
    if (existing) {
      throw new Error(
        `Recipe with formId "${recipe.formId}" and version "${recipe.version}" already exists`,
      );
    }

    const entity = repo.create({
      formId: recipe.formId,
      version: recipe.version,
      schema: recipe,
      publishedAt: null,
    });
    await repo.save(entity);
  });

export const updateRecipe = createServerFn({ method: "POST" })
  .middleware([requireAdminToken])
  .inputValidator(
    z.object({
      formId: z.string(),
      recipe: z.unknown(),
    }),
  )
  .handler(async ({ data }): Promise<void> => {
    const recipe = data.recipe as ServiceContractRecipe;
    const ds = await getDataSource();

    const rows = await ds.query<FormDefinitionRow[]>(
      `SELECT id, version, schema, published_at
       FROM form_definitions
       WHERE form_id = $1
       ORDER BY string_to_array(version, '.')::int[] DESC
       LIMIT 1`,
      [data.formId],
    );
    if (!rows.length) {
      throw new Error(`No recipe found for formId: ${data.formId}`);
    }
    const row = rows[0];
    if (row.published_at !== null) {
      throw new Error("Cannot update a published recipe");
    }
    if (recipe.version !== row.version) {
      throw new Error(
        `Version mismatch: stored version is ${row.version}, recipe version is ${recipe.version}`,
      );
    }

    await ds.query(`UPDATE form_definitions SET schema = $1 WHERE id = $2`, [
      recipe,
      row.id,
    ]);
  });

export const nextVersion = createServerFn({ method: "GET" })
  .middleware([requireAdminToken])
  .inputValidator(z.object({ formId: z.string() }))
  .handler(
    async ({
      data,
    }): Promise<{ currentVersion: string | null; nextVersion: string }> => {
      const ds = await getDataSource();

      const rows = await ds.query<FormDefinitionRow[]>(
        `SELECT id, version, schema, published_at
         FROM form_definitions
         WHERE form_id = $1
         ORDER BY string_to_array(version, '.')::int[] DESC
         LIMIT 1`,
        [data.formId],
      );

      if (!rows.length) {
        return { currentVersion: null, nextVersion: "1.0.0" };
      }

      return {
        currentVersion: rows[0].version,
        nextVersion: bumpMinor(rows[0].version),
      };
    },
  );
